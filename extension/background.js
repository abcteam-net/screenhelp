// MV3 service worker for ScreenHelp.
//
// Responsibilities:
//  - Map global Chrome commands (browser-wide hotkeys) to ScreenHelp triggers.
//  - Open the side panel when the toolbar icon is clicked.
//  - Forward command events to the side panel via chrome.runtime.sendMessage,
//    which the side panel page (an iframe wrapper around the web app) relays
//    via postMessage into the web app.

const APP_URL = "http://localhost:3000";

chrome.runtime.onInstalled.addListener(async () => {
  // Behavior: clicking the toolbar action opens the side panel.
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (e) {
    console.warn("setPanelBehavior failed", e);
  }

  // Context menu: right-click → "Ask ScreenHelp about this page"
  chrome.contextMenus.create(
    {
      id: "screenhelp-ask-page",
      title: "Ask ScreenHelp about this page",
      contexts: ["page", "selection"],
    },
    () => void chrome.runtime.lastError, // silence dupe-create error on reload
  );
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "screenhelp-ask-page") return;
  await openPanel(tab?.windowId);
  await broadcast({
    type: "screenhelp:command",
    command: "answer-now",
    selectionText: info.selectionText || "",
    pageUrl: info.pageUrl || tab?.url || "",
  });
});

chrome.commands.onCommand.addListener(async (command) => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const windowId = tabs[0]?.windowId;
  if (command === "open-side-panel") {
    await openPanel(windowId);
    return;
  }
  // Make sure the panel is open so the web app receives the message.
  await openPanel(windowId);
  await broadcast({ type: "screenhelp:command", command });
});

async function openPanel(windowId) {
  try {
    if (windowId !== undefined) {
      await chrome.sidePanel.open({ windowId });
    }
  } catch (e) {
    console.warn("sidePanel.open failed", e);
  }
}

async function broadcast(message) {
  try {
    await chrome.runtime.sendMessage(message);
  } catch (e) {
    // No receiver yet (panel still booting). Stash it for the next listener.
    await chrome.storage.session.set({ pendingCommand: message });
  }
}
