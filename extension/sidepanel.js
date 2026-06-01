// Side panel wrapper: probes whether the local web app is running. If yes,
// embeds it in an iframe and relays extension command messages into it via
// postMessage. If no, shows a friendly "start the dev server" state.

const APP_URLS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:3003",
];
let appUrl = APP_URLS[0];

const statusEl = document.getElementById("status");
const appEl = document.getElementById("app");
const dot = document.getElementById("dot");
const stateLabel = document.getElementById("state");
const retryBtn = document.getElementById("retry");
const urlEl = document.getElementById("url");

urlEl.textContent = APP_URLS.join(" / ");

async function probe() {
  stateLabel.textContent = "Checking…";
  dot.classList.remove("ok");
  for (const candidate of APP_URLS) {
    try {
      const res = await fetch(candidate + "/", { method: "GET", mode: "no-cors" });
      // no-cors gives an opaque response; success just means the server answered.
      if (res) {
        appUrl = candidate;
        mountApp();
        return;
      }
    } catch (e) {
      // try next port
    }
  }
  showOffline();
}

function mountApp() {
  appEl.src = appUrl + "/?embedded=1";
  appEl.style.display = "block";
  statusEl.style.display = "none";
  dot.classList.add("ok");
  stateLabel.textContent = "Connected";

  // Replay any command queued while the panel was loading.
  chrome.storage.session.get("pendingCommand", (data) => {
    if (data?.pendingCommand) {
      relay(data.pendingCommand);
      chrome.storage.session.remove("pendingCommand");
    }
  });
}

function showOffline() {
  appEl.style.display = "none";
  statusEl.style.display = "flex";
  dot.classList.remove("ok");
  stateLabel.textContent = "Not running";
}

retryBtn.addEventListener("click", probe);

// Relay extension messages → web app
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "screenhelp:command") relay(msg);
});

function relay(msg) {
  if (appEl.contentWindow) {
    appEl.contentWindow.postMessage(msg, appUrl);
  }
}

probe();
