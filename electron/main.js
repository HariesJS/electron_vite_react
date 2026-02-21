import {app, BrowserWindow, dialog, ipcMain} from "electron"
import {existsSync, readFileSync} from "node:fs"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DEFAULT_MODEL = "gemini-2.0-flash"
const ENV_FILE_PATH = join(__dirname, "../.env")

const loadEnvFromFile = (filepath) => {
    if (!existsSync(filepath)) {
        return
    }

    const fileContent = readFileSync(filepath, "utf-8")
    const lines = fileContent.split(/\r?\n/)

    for (const rawLine of lines) {
        const line = rawLine.trim()

        if (!line || line.startsWith("#")) {
            continue
        }

        const separatorIndex = line.indexOf("=")
        if (separatorIndex === -1) {
            continue
        }

        const key = line.slice(0, separatorIndex).trim()
        const value = line.slice(separatorIndex + 1).trim()

        if (!key || process.env[key]) {
            continue
        }

        process.env[key] = value
    }
}

loadEnvFromFile(ENV_FILE_PATH)

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_MODEL = process.env.GEMINI_MODEL || DEFAULT_MODEL
const GEMINI_API_VERSION = process.env.GEMINI_API_VERSION || "v1beta"
const FALLBACK_MODELS = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
]
const GEMINI_BASE_URL = `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}`

if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing. Add it to .env")
}

const mapMessagesToGemini = (messages) => {
    return messages
        .filter(
            (message) =>
                message.role === "user" || message.role === "assistant",
        )
        .map((message) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: [{text: message.content}],
        }))
}

const extractTextFromGeminiResponse = (payload) => {
    const candidate = payload?.candidates?.[0]
    const parts = candidate?.content?.parts ?? []

    return parts
        .map((part) => part.text)
        .filter(Boolean)
        .join("\n")
        .trim()
}

const normalizeModelName = (raw) => {
    return raw.startsWith("models/") ? raw.replace("models/", "") : raw
}

const parseErrorPayload = async (response) => {
    const raw = await response.text()

    try {
        return {
            details:
                (JSON.parse(raw)?.error?.message &&
                    `${JSON.parse(raw)?.error?.status || ""} ${JSON.parse(raw)?.error?.message}`.trim()) ||
                raw,
            raw,
        }
    } catch {
        return {details: raw, raw}
    }
}

const callGemini = async (model, contents) => {
    const endpoint = `${GEMINI_BASE_URL}/models/${model}:generateContent?key=${GEMINI_API_KEY}`
    const response = await fetch(endpoint, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            contents,
            generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 1024,
            },
        }),
    })

    if (!response.ok) {
        const parsed = await parseErrorPayload(response)
        const shouldTryAnotherModel =
            parsed.details.includes("is not found for API version") ||
            parsed.details.includes("is not supported for generateContent")

        return {
            ok: false,
            status: response.status,
            details: parsed.details,
            shouldTryAnotherModel,
        }
    }

    const payload = await response.json()
    const text = extractTextFromGeminiResponse(payload)

    if (!text) {
        return {
            ok: false,
            status: 502,
            details: "Gemini returned an empty response",
            shouldTryAnotherModel: false,
        }
    }

    return {ok: true, text, model}
}

const listGenerateContentModels = async () => {
    const endpoint = `${GEMINI_BASE_URL}/models?key=${GEMINI_API_KEY}`
    const response = await fetch(endpoint, {
        method: "GET",
        headers: {"Content-Type": "application/json"},
    })

    if (!response.ok) {
        return []
    }

    const data = await response.json()
    if (!Array.isArray(data.models)) {
        return []
    }

    return data.models
        .filter((model) =>
            model.supportedGenerationMethods?.includes("generateContent"),
        )
        .map((model) => normalizeModelName(model.name ?? ""))
        .filter(Boolean)
}

const createWindow = () => {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        resizable: true,
        webPreferences: {
            preload: join(__dirname, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    })

    if (app.isPackaged) {
        win.loadFile(join(__dirname, "../dist/index.html"))
    } else {
        win.loadURL("http://localhost:5173")
    }

    win.on("close", (event) => {
        event.preventDefault()

        dialog
            .showMessageBox(win, {
                type: "question",
                buttons: ["Yes", "No"],
                title: "Confirm",
                message: "Are you sure you want to quit?",
            })
            .then((result) => {
                if (result.response === 0) {
                    win.destroy()
                }
            })
    })
}

ipcMain.handle("chat:send-message", async (_, messages) => {
    const contents = mapMessagesToGemini(messages)
    const preferred = normalizeModelName(GEMINI_MODEL)
    const queue = [preferred, ...FALLBACK_MODELS].map(normalizeModelName)
    const tried = new Set()

    let lastStatus = 500
    let lastError = "Gemini request failed"

    while (queue.length > 0) {
        const model = queue.shift()
        if (!model || tried.has(model)) {
            continue
        }

        tried.add(model)

        const result = await callGemini(model, contents)
        if (result.ok) {
            return {text: result.text, modelUsed: result.model}
        }

        lastStatus = result.status
        lastError = result.details

        if (result.shouldTryAnotherModel) {
            const discovered = await listGenerateContentModels()
            for (const discoveredModel of discovered) {
                if (!tried.has(discoveredModel)) {
                    queue.push(discoveredModel)
                }
            }
        }
    }

    throw new Error(
        `Gemini request failed: ${lastStatus} ${lastError}. Tried models: ${Array.from(tried).join(", ")}`,
    )
})

app.whenReady().then(createWindow)

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit()
    }
})

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})
