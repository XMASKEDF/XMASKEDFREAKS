type GlobalErrorCopy = {
  brand: string;
  title: string;
  description: string;
  reload: string;
  home: string;
  clearCache: string;
};

const copies: Record<string, GlobalErrorCopy> = {
  en: { brand: "XMASKEDFREAKS", title: "XMASKEDFREAKS temporarily failed to load correctly.", description: "Your account and purchase data have not been changed. Reload the page or return home.", reload: "Reload", home: "Return Home", clearCache: "Clear Local Cache" },
  es: { brand: "XMASKEDFREAKS", title: "XMASKEDFREAKS no pudo cargarse correctamente por el momento.", description: "Los datos de tu cuenta y tus compras no han cambiado. Recarga la página o vuelve al inicio.", reload: "Recargar", home: "Volver al inicio", clearCache: "Borrar caché local" },
  fr: { brand: "XMASKEDFREAKS", title: "XMASKEDFREAKS n’a temporairement pas pu se charger correctement.", description: "Les données de votre compte et de vos achats n’ont pas été modifiées. Rechargez la page ou revenez à l’accueil.", reload: "Recharger", home: "Retour à l’accueil", clearCache: "Vider le cache local" },
  de: { brand: "XMASKEDFREAKS", title: "XMASKEDFREAKS konnte vorübergehend nicht richtig geladen werden.", description: "Deine Konto- und Kaufdaten wurden nicht verändert. Lade die Seite neu oder kehre zur Startseite zurück.", reload: "Neu laden", home: "Zur Startseite", clearCache: "Lokalen Cache leeren" },
  pt: { brand: "XMASKEDFREAKS", title: "O XMASKEDFREAKS não foi carregado corretamente no momento.", description: "Os dados da sua conta e das suas compras não foram alterados. Recarregue a página ou volte ao início.", reload: "Recarregar", home: "Voltar ao início", clearCache: "Limpar cache local" },
  ja: { brand: "XMASKEDFREAKS", title: "XMASKEDFREAKS を一時的に正しく読み込めませんでした。", description: "アカウントと購入データは変更されていません。ページを再読み込みするか、ホームに戻ってください。", reload: "再読み込み", home: "ホームに戻る", clearCache: "ローカルキャッシュを削除" },
  ko: { brand: "XMASKEDFREAKS", title: "XMASKEDFREAKS를 일시적으로 올바르게 불러오지 못했습니다.", description: "계정 및 구매 데이터는 변경되지 않았습니다. 페이지를 새로고침하거나 홈으로 돌아가세요.", reload: "새로고침", home: "홈으로", clearCache: "로컬 캐시 지우기" },
  "zh-CN": { brand: "XMASKEDFREAKS", title: "XMASKEDFREAKS 暂时无法正确加载。", description: "你的账户和购买数据未发生更改。请重新加载页面或返回首页。", reload: "重新加载", home: "返回首页", clearCache: "清除本地缓存" },
  ar: { brand: "XMASKEDFREAKS", title: "تعذر تحميل XMASKEDFREAKS بشكل صحيح مؤقتًا.", description: "لم تتغير بيانات حسابك أو مشترياتك. أعد تحميل الصفحة أو ارجع إلى الصفحة الرئيسية.", reload: "إعادة التحميل", home: "العودة للرئيسية", clearCache: "مسح التخزين المؤقت المحلي" },
  ru: { brand: "XMASKEDFREAKS", title: "XMASKEDFREAKS временно не удалось загрузить правильно.", description: "Данные вашей учетной записи и покупок не изменены. Перезагрузите страницу или вернитесь на главную.", reload: "Перезагрузить", home: "На главную", clearCache: "Очистить локальный кэш" }
};

export function getGlobalErrorCopy(locale: string) {
  const normalized = locale.toLowerCase();
  const key = normalized.startsWith("zh") ? "zh-CN" : normalized.split("-")[0];
  return copies[key] || copies.en;
}
