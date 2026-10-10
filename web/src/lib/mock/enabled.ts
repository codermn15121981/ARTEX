// Переключатель Mock. Публичная переменная, внедряемая во время сборки (доступна в браузере только с префиксом NEXT_PUBLIC_).
// На Vercel установка NEXT_PUBLIC_MOCK=1 переводит весь сайт на mock без необходимости в бэкенде.
export const MOCK = process.env.NEXT_PUBLIC_MOCK === "1";
