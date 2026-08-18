const HOST_ID = "instagram-capture-utility-host";

const STYLES = `
  :host { all: initial; color-scheme: light dark; }
  * { box-sizing: border-box; }
  button, input { font: inherit; }
  .capture { position: fixed; right: 24px; bottom: 24px; z-index: 2147483646;
    border: 0; border-radius: 999px; padding: 12px 18px; cursor: pointer;
    background: #7c3aed; color: white; font: 600 14px/1.2 system-ui, sans-serif;
    box-shadow: 0 8px 28px #0006; }
  .capture:hover { background: #6d28d9; }
  .backdrop { position: fixed; inset: 0; z-index: 2147483647; display: grid;
    place-items: center; padding: 20px; background: #0009; font: 14px/1.45 system-ui, sans-serif; }
  .panel { width: min(560px, 100%); max-height: min(760px, 92vh); overflow: auto;
    border: 1px solid #ffffff24; border-radius: 14px; padding: 22px;
    background: #18181b; color: #fafafa; box-shadow: 0 24px 80px #000a; }
  h2 { margin: 0 0 8px; font-size: 20px; } p { margin: 8px 0; }
  .muted { color: #a1a1aa; } .warning { color: #fbbf24; }
  label { display: block; margin: 16px 0 6px; font-weight: 600; }
  input[type=text] { width: 100%; border: 1px solid #52525b; border-radius: 8px;
    padding: 10px 12px; background: #27272a; color: #fafafa; }
  .check { display: flex; gap: 9px; align-items: center; font-weight: 500; }
  .actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
  .action { border: 1px solid #52525b; border-radius: 8px; padding: 9px 14px;
    cursor: pointer; background: #27272a; color: #fafafa; }
  .primary { border-color: #7c3aed; background: #7c3aed; }
  .danger { border-color: #dc2626; background: #991b1b; }
  .path { margin: 14px 0; padding: 10px; border-radius: 8px; background: #27272a;
    overflow-wrap: anywhere; }
  .folders { display: grid; gap: 6px; min-height: 80px; }
  .folder { width: 100%; text-align: left; }
  .toast { position: fixed; right: 24px; bottom: 84px; z-index: 2147483647;
    max-width: min(420px, calc(100vw - 48px)); border-radius: 10px; padding: 12px 15px;
    background: #18181b; color: #fafafa; border: 1px solid #ffffff24;
    font: 14px/1.4 system-ui, sans-serif; box-shadow: 0 10px 35px #0008; }
  .progress { height: 8px; overflow: hidden; border-radius: 999px; background: #3f3f46; margin-top: 14px; }
  .progress > span { display: block; height: 100%; background: #7c3aed; transition: width .2s; }
`;

function append(parent, tag, text, className) {
  const element = parent.ownerDocument.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  parent.append(element);
  return element;
}

export function createAppUi({ documentObject = document } = {}) {
  const existing = documentObject.getElementById(HOST_ID);
  existing?.remove();
  const host = documentObject.createElement("div");
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });
  const style = documentObject.createElement("style");
  style.textContent = STYLES;
  shadow.append(style);
  documentObject.documentElement.append(host);

  const captureButton = append(shadow, "button", "Save Instagram item", "capture");
  captureButton.type = "button";
  captureButton.hidden = true;
  let captureHandler = null;
  captureButton.addEventListener("click", () => captureHandler?.());
  let backdrop = null;
  let toastTimer = null;
  let cancelModal = null;
  shadow.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && cancelModal) {
      event.preventDefault();
      cancelModal();
    }
  });

  function closeModal() {
    backdrop?.remove();
    backdrop = null;
    cancelModal = null;
  }

  function openModal(title) {
    closeModal();
    backdrop = append(shadow, "div", undefined, "backdrop");
    const panel = append(backdrop, "section", undefined, "panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    append(panel, "h2", title);
    return panel;
  }

  function action(parent, label, className = "") {
    const button = append(parent, "button", label, "action " + className);
    button.type = "button";
    return button;
  }

  return Object.freeze({
    destroy() { host.remove(); },

    setCaptureAvailable(available, handler, label = "Save Instagram item") {
      captureButton.hidden = !available;
      captureButton.textContent = label;
      captureHandler = available ? handler : null;
    },

    showBusy(message) {
      const panel = openModal("Instagram Capture");
      append(panel, "p", message, "muted");
      const progress = append(panel, "div", undefined, "progress");
      append(progress, "span").style.width = "35%";
    },

    showProgress(event) {
      if (!backdrop) this.showBusy("Preparing capture…");
      const panel = backdrop.querySelector(".panel");
      const message = panel.querySelector("p") ?? append(panel, "p", "");
      if (event.phase === "downloading") {
        message.textContent = "Downloading media " + event.index + " of " + event.total + "…";
        panel.querySelector(".progress > span").style.width =
          Math.round(((event.index - 1) / event.total) * 100) + "%";
      } else if (event.phase === "complete") {
        message.textContent = "Writing capture…";
        panel.querySelector(".progress > span").style.width = "100%";
      }
    },

    closeModal,

    notify(message, { error = false, duration = 6000 } = {}) {
      shadow.querySelector(".toast")?.remove();
      clearTimeout(toastTimer);
      const toast = append(shadow, "div", message, "toast" + (error ? " warning" : ""));
      toast.setAttribute("role", "status");
      toastTimer = setTimeout(() => toast.remove(), duration);
    },

    showCaptureOptions({ captureItem, warnings = [], defaultMode = "obsidian" }) {
      const panel = openModal("Instagram Capture");
      append(panel, "p", "@" + captureItem.author, "muted");
      append(panel, "p", captureItem.contentType + " • " + captureItem.mediaCount + " media item" + (captureItem.mediaCount === 1 ? "" : "s"));
      for (const warning of warnings) append(panel, "p", warning, "warning");
      const modeLabel = append(panel, "label", undefined, "check");
      const checkbox = append(modeLabel, "input");
      checkbox.type = "checkbox";
      checkbox.checked = defaultMode === "obsidian";
      append(modeLabel, "span", "Save to Obsidian vault");
      const titleLabel = append(panel, "label", "Note / folder title");
      titleLabel.htmlFor = "instagram-capture-title";
      const titleInput = append(panel, "input");
      titleInput.id = "instagram-capture-title";
      titleInput.type = "text";
      titleInput.value = captureItem.proposedTitle;
      const actions = append(panel, "div", undefined, "actions");
      const cancel = action(actions, "Cancel");
      const proceed = action(actions, "Continue", "primary");
      titleInput.focus();

      return new Promise((resolve) => {
        cancelModal = () => { closeModal(); resolve(null); };
        cancel.addEventListener("click", cancelModal);
        proceed.addEventListener("click", () => {
          const title = titleInput.value.trim();
          if (!title) { titleInput.focus(); return; }
          closeModal();
          resolve(Object.freeze({ mode: checkbox.checked ? "obsidian" : "download", title }));
        });
      });
    },

    chooseDecision({ title, message, choices }) {
      const panel = openModal(title);
      append(panel, "p", message);
      const actions = append(panel, "div", undefined, "actions");
      return new Promise((resolve) => {
        cancelModal = () => { closeModal(); resolve(choices[0]?.value); };
        for (const choice of choices) {
          const button = action(actions, choice.label, choice.primary ? "primary" : choice.danger ? "danger" : "");
          button.addEventListener("click", () => { closeModal(); resolve(choice.value); });
        }
      });
    },

    async chooseVaultFolder({ rootHandle, fileSystem, initialSegments = [] }) {
      let current = rootHandle;
      let segments = [];
      try {
        current = await fileSystem.getDirectoryPath(rootHandle, initialSegments);
        segments = [...initialSegments];
      } catch {
        current = rootHandle;
      }
      const panel = openModal("Choose note destination");
      const path = append(panel, "div", undefined, "path");
      const folders = append(panel, "div", undefined, "folders");
      const actions = append(panel, "div", undefined, "actions");
      const cancel = action(actions, "Cancel");
      const back = action(actions, "Back");
      const select = action(actions, "Select this folder", "primary");

      return new Promise((resolve) => {
        cancelModal = () => { closeModal(); resolve(null); };
        async function render() {
          path.textContent = "/" + segments.join("/");
          back.disabled = segments.length === 0;
          folders.replaceChildren();
          append(folders, "p", "Loading folders…", "muted");
          try {
            const entries = await fileSystem.listDirectories(current);
            folders.replaceChildren();
            if (entries.length === 0) append(folders, "p", "No subfolders", "muted");
            for (const entry of entries) {
              const button = action(folders, "📁 " + entry.name, "folder");
              button.addEventListener("click", async () => {
                current = entry.handle;
                segments.push(entry.name);
                await render();
              });
            }
          } catch (error) {
            folders.replaceChildren();
            append(folders, "p", "Unable to read this folder: " + error.message, "warning");
          }
        }
        cancel.addEventListener("click", cancelModal);
        back.addEventListener("click", async () => {
          segments.pop();
          current = await fileSystem.getDirectoryPath(rootHandle, segments);
          await render();
        });
        select.addEventListener("click", () => {
          const result = Object.freeze({ handle: current, segments: Object.freeze([...segments]) });
          closeModal();
          resolve(result);
        });
        void render();
      });
    },
  });
}
