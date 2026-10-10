package selfupdate

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Repo — источник релизов. Зашито в код, а не вынесено в конфигурацию: если бы
// источник обновления был настраиваемым, это дало бы любому, кто может менять
// конфигурацию, канал удалённого выполнения кода — для платформы пентестинга
// такую дверь оставлять нельзя.
//
// Этот форк (перевод интерфейса на русский) указывает на собственный репозиторий,
// а не на оригинальный проект: так обновление в один клик никогда не подменит
// переведённую сборку непереведённым бинарником автора оригинала. Пока в этом
// репозитории нет собственных тегированных релизов, FetchLatest корректно
// возвращает ошибку «релиз не найден» — это ожидаемо и безопасно.
const Repo = "codermn15121981/ARTEX"

// latestURL — эндпоинт GitHub "последний официальный релиз". Автоматически пропускает prerelease и draft.
const latestURL = "https://api.github.com/repos/" + Repo + "/releases/latest"

// allowedHosts ограничивает домены, к которым может обращаться цепочка
// обновления. В паре с checkRedirect ниже: любой переход по редиректу на хост
// не из списка сразу завершается ошибкой — это первый барьер против подмены
// бинарника через DNS-спуфинг / MITM, второй барьер — сверка SHA256SUMS.
var allowedHosts = map[string]bool{
	"api.github.com":                       true,
	"github.com":                           true,
	"objects.githubusercontent.com":        true, // объектное хранилище, куда фактически попадают активы релиза
	"release-assets.githubusercontent.com": true,
	"raw.githubusercontent.com":            true,
}

// Release — поля GitHub Release, которые нам нужны.
type Release struct {
	TagName     string    `json:"tag_name"`
	Name        string    `json:"name"`
	Body        string    `json:"body"`
	Draft       bool      `json:"draft"`
	Prerelease  bool      `json:"prerelease"`
	PublishedAt time.Time `json:"published_at"`
	HTMLURL     string    `json:"html_url"`
	Assets      []Asset   `json:"assets"`
}

// Asset — один файл, прикреплённый к Release.
type Asset struct {
	Name string `json:"name"`
	URL  string `json:"browser_download_url"`
	Size int64  `json:"size"`
}

// NewClient создаёт HTTP-клиент, работающий только с доменами GitHub. Если proxy пуст — прямое соединение.
//
// Намеренно не переиспользуем стандартный Transport: цепочка обновления обязана
// работать только через TLS с проверкой сертификата и не должна зависеть от
// настроек типа InsecureSkipVerify, заданных где-то ещё в программе.
func NewClient(proxy string) *http.Client {
	tr := &http.Transport{
		ForceAttemptHTTP2:   true,
		TLSHandshakeTimeout: 15 * time.Second,
	}
	if p := strings.TrimSpace(proxy); p != "" {
		if pu, err := url.Parse(p); err == nil {
			tr.Proxy = http.ProxyURL(pu)
		}
	}
	return &http.Client{
		Transport: tr,
		Timeout:   30 * time.Minute, // загружается целый пакет, нельзя зависнуть по тайм-ауту отдельного запроса
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return fmt.Errorf("слишком много перенаправлений")
			}
			return checkURL(req.URL)
		},
	}
}

// checkURL принудительно требует https + белый список доменов.
func checkURL(u *url.URL) error {
	if u.Scheme != "https" {
		return fmt.Errorf("отклонён не-HTTPS адрес: %s", u.Scheme+"://"+u.Host)
	}
	if !allowedHosts[strings.ToLower(u.Hostname())] {
		return fmt.Errorf("отклонён домен не GitHub: %s", u.Hostname())
	}
	return nil
}

// FetchLatest запрашивает последний официальный релиз.
func FetchLatest(ctx context.Context, c *http.Client) (*Release, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, latestURL, nil)
	if err != nil {
		return nil, err
	}
	if err := checkURL(req.URL); err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "artex-selfupdate")

	resp, err := c.Do(req)
	if err != nil {
		return nil, fmt.Errorf("не удалось обратиться к GitHub (можно настроить глобальный прокси в системных настройках): %w", err)
	}
	defer resp.Body.Close()

	switch {
	case resp.StatusCode == http.StatusForbidden, resp.StatusCode == http.StatusTooManyRequests:
		// Неавторизованный GitHub API — 60 запросов в час на IP, легко упереться при общем исходящем IP.
		return nil, fmt.Errorf("превышен лимит запросов к GitHub (60 в час), повторите попытку позже")
	case resp.StatusCode == http.StatusNotFound:
		return nil, fmt.Errorf("в репозитории %s пока нет ни одного официального релиза", Repo)
	case resp.StatusCode != http.StatusOK:
		return nil, fmt.Errorf("GitHub вернул %d", resp.StatusCode)
	}

	var rel Release
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return nil, fmt.Errorf("не удалось разобрать Release: %w", err)
	}
	if strings.TrimSpace(rel.TagName) == "" {
		return nil, fmt.Errorf("у Release отсутствует tag")
	}
	return &rel, nil
}

// AssetName возвращает имя пакета релиза для текущей платформы, в соответствии
// с package_binary из build.sh: artex-<версия>-<os>-<arch>.zip (версия без префикса v).
func AssetName(tag, goos, goarch string) string {
	return fmt.Sprintf("artex-%s-%s-%s.zip", strings.TrimPrefix(tag, "v"), goos, goarch)
}

// FindAsset ищет актив в Release по имени.
func (r *Release) FindAsset(name string) (Asset, bool) {
	for _, a := range r.Assets {
		if strings.EqualFold(a.Name, name) {
			return a, true
		}
	}
	return Asset{}, false
}
