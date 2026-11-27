let initialized = false;
function fields() {
  const mode = document.getElementById("mode").value;
  document.getElementById("address-row").hidden = mode === "standalone";
  document.getElementById("fingerprint-row").hidden = mode !== "client";
}
const render = (value) => {
  document.getElementById("status").textContent = value.message;
  document.getElementById("actions").hidden = !value.error;
  if (!initialized && value.connection) {
    initialized = true;
    document.getElementById("mode").value =
      value.connection.mode === "unconfigured"
        ? "standalone"
        : value.connection.mode;
    document.getElementById("server-url").value =
      value.connection.serverUrl || "";
    document.getElementById("fingerprint").value =
      value.connection.fingerprint || "";
    fields();
  }
  document.getElementById("lan-info").hidden = !value.lan;
  if (value.lan) {
    document.getElementById("lan-url").textContent = value.lan.serverUrl;
    document.getElementById("lan-fingerprint").value = value.lan.fingerprint;
    document.getElementById("lan-certificate").textContent =
      "Public certificate: " + value.lan.certificate;
  }
};
fields();
document.getElementById("mode").addEventListener("change", fields);
document
  .getElementById("connection")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await window.desktopPreview.configure({
        mode: document.getElementById("mode").value,
        serverUrl: document.getElementById("server-url").value,
        fingerprint: document.getElementById("fingerprint").value,
      });
    } catch (error) {
      document.getElementById("status").textContent = error.message;
    }
  });
window.desktopPreview.status().then(render);
window.desktopPreview.onStatus(render);
document
  .getElementById("retry")
  .addEventListener("click", () => window.desktopPreview.retry());
document
  .getElementById("choose")
  .addEventListener("click", () => window.desktopPreview.chooseMongo());
