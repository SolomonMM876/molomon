(() => {
  "use strict";
  const config = window.MOLOMON_CONFIG || {};
  document.title = typeof config.title === "string" && config.title.trim() ? config.title : "Molomon";
  const message = config.secret && typeof config.secret.message === "string" && config.secret.message.trim() ? config.secret.message : "I love you";
  document.getElementById("secret-message").textContent = message;
})();
