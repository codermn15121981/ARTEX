import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Вспомогательная функция для решения onInteractOutside панели/диалога (Sheet/Dialog) о закрытии.
//
// Контекст: всплывающие слои Radix внутри панели (выпадающий список Select, DropdownMenu,
// Popover и т.д.) портятся за пределы панели. Когда слой открыт и кликают по оверлею/вне
// панели, чтобы его закрыть, этот pointerdown одновременно обрабатывают два DismissableLayer —
// у Select и у Sheet; Select закрывается первым, и это дискретное событие, React синхронно
// флушит обновление, так что когда очередь доходит до обработчика Sheet, data-state слоя уже
// успел стать closed — проверка «открыт ли слой прямо сейчас» в момент обработки по природе
// ненадёжна (проверено на практике).
//
// Правильный подход: слушатель pointerdown у Radix работает на фазе bubbling; мы на фазе
// capture (раньше него) заранее фиксируем, «был ли открыт слой в этот момент», а
// onInteractOutside затем читает это зафиксированное значение, чтобы решить, разрешать закрытие или нет.
function isRadixOverlayOpenNow(): boolean {
  if (typeof document === "undefined") return false;
  return !!document.querySelector(
    [
      "[data-slot='select-trigger'][data-state='open']",
      "[data-slot='select-content'][data-state='open']",
      "[role='listbox'][data-state='open']",
      "[data-radix-popper-content-wrapper]",
      "[aria-expanded='true'][data-state='open']",
    ].join(","),
  );
}

let overlayOpenAtLastPointerDown = false;
if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    () => {
      overlayOpenAtLastPointerDown = isRadixOverlayOpenNow();
    },
    true, // capture: фиксируем раньше, чем сработает обработчик pointerdown Radix на фазе bubbling
  );
}

// radixOverlayWasOpenAtPointerDown возвращает, «был ли открыт какой-либо слой Radix в момент
// последнего pointerdown». Панель/диалог использует это: если слой был открыт, клик по оверлею
// закрывает только слой, а не саму панель.
export function radixOverlayWasOpenAtPointerDown(): boolean {
  return overlayOpenAtLastPointerDown;
}

// copyText записывает текст в буфер обмена, возвращает успех операции.
// Контекст: navigator.clipboard доступен только в безопасном контексте (HTTPS / localhost);
// при доступе по IP + HTTP он равен undefined, в этом случае происходит откат на execCommand("copy").
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Продолжаем откатом на запасной вариант
    }
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export const getInitials = (str: string): string => {
  if (typeof str !== "string" || !str.trim()) return "?";

  return (
    str
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "?"
  );
};

export function formatCurrency(
  amount: number,
  opts?: {
    currency?: string;
    locale?: string;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    noDecimals?: boolean;
  },
) {
  const { currency = "USD", locale = "en-US", minimumFractionDigits, maximumFractionDigits, noDecimals } = opts ?? {};

  const formatOptions: Intl.NumberFormatOptions = {
    style: "currency",
    currency,
    minimumFractionDigits: noDecimals ? 0 : minimumFractionDigits,
    maximumFractionDigits: noDecimals ? 0 : maximumFractionDigits,
  };

  return new Intl.NumberFormat(locale, formatOptions).format(amount);
}
