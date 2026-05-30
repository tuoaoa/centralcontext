# CentralContext Auto-Injection Verification Test Suite v1.0

This test suite details the exact verification scenarios to validate the **Automated Context Ingestion System** inside the browser extension.

---

## 🛠️ Test Cases

### 🧪 Test A - Manual Inject
*   **Objective**: Verify that manual click injection continues to work flawlessly.
*   **Steps**:
    1. Open an active chat window on ChatGPT (`https://chatgpt.com/`), Gemini (`https://gemini.google.com/`), or Claude (`https://claude.ai/`).
    2. Open the extension popup panel.
    3. Click the **Inject CentralContext Pack** button.
*   **Expected Result**: The prompt textbox is instantly filled with the full Context Pack payload, and the popup displays "CentralContext Pack Injected!" without submitting the chat.
*   **Status**: ✅ **PASS**

---

### 🧪 Test B - Auto Inject New ChatGPT
*   **Objective**: Verify that new chat sessions automatically ingest the Context Pack on load without requiring click actions.
*   **Steps**:
    1. Open the extension popup panel.
    2. Toggle **Auto Inject Context** to **ON**.
    3. (First-run only) Read the warning alert and click **Enable Auto Inject**. Confirm the toggle state reads `Status: ON` in green.
    4. Open a fresh ChatGPT tab: `https://chatgpt.com/`.
*   **Expected Result**: The extension waits for the prompt `#prompt-textarea` to render in the DOM and automatically populates the text box with the complete Context Pack. No submit action is triggered.
*   **Status**: ✅ **PASS**

---

### 🧪 Test C - No Duplicate Inject
*   **Objective**: Verify that the extension does not repeatedly paste/inject the context pack into the same URL context.
*   **Steps**:
    1. Complete **Test B** so the chat URL is injected.
    2. Reload/refresh the exact same ChatGPT tab (`F5` or `Cmd+R`).
    3. Wait for the page load to complete.
*   **Expected Result**: The extension checks the URL and context pack version hash against `centralcontext_injected_urls` in `chrome.storage.local`. Since they match, it skips injection, leaving the prompt input empty and clean. No duplicate text is appended.
*   **Status**: ✅ **PASS**

---

### 🧪 Test D - Respect User Typing
*   **Objective**: Ensure the extension never overwrites or interferes with active user drafts.
*   **Steps**:
    1. Open a new chat session.
    2. Before injection takes place (or with Auto Inject ON on a new page), type `"hello"` into the prompt textbox.
    3. Trigger a page mutation (or refresh the tab with Auto Inject active).
*   **Expected Result**: The extension checks if the textbox content is empty or already contains the exact context pack text. Since it detects `"hello"` (dirty state), it immediately skips auto-injection to safeguard the user's active typing draft.
*   **Status**: ✅ **PASS**

---

### 🧪 Test E - Gemini Auto Inject
*   **Objective**: Verify that automated injection works correctly on Google Gemini.
*   **Steps**:
    1. Open a fresh Google Gemini tab: `https://gemini.google.com/`.
    2. With Auto Inject active (**ON**), wait for the textbox to load.
*   **Expected Result**: The extension locates Gemini's rich text editor DOM node (`rich-textarea div[contenteditable="true"]`) and populates it with the complete Context Pack natively.
*   **Status**: ✅ **PASS**

---

### 🧪 Test F - Consumption Verification
*   **Objective**: Verify that the AI successfully ingests the context pack and passes the test verification token.
*   **Steps**:
    1. Let the system automatically inject the pack into a new ChatGPT or Gemini session.
    2. Submit the injected prompt to load the context.
    3. Ask the AI: `"Context injection test result?"`
*   **Expected Result**: The AI reads the embedded marker `SECRET_CONTEXT_TEST_8892` and immediately responds with:
    > **AUTO_CONTEXT_PASS**
*   **Status**: ✅ **PASS**

---

## 🧼 Management & Utility
*   **Reset Inject State Button**: Located in the popup panel. Click it to clear the saved injection URL history from `chrome.storage.local`. This forces the extension to re-inject context into previously visited chat rooms on next page load or mutation.
