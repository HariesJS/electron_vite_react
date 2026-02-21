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

const parseRetryDelayMs = (payload) => {
    const details = payload?.error?.details

    if (!Array.isArray(details)) {
        return null
    }

    const retryInfo = details.find(
        (item) =>
            item?.["@type"] === "type.googleapis.com/google.rpc.RetryInfo",
    )
    const retryDelay = retryInfo?.retryDelay

    if (typeof retryDelay !== "string") {
        return null
    }

    const matched = retryDelay.match(/^(\d+)s$/)
    if (!matched) {
        return null
    }

    const seconds = Number(matched[1])
    return Number.isFinite(seconds) ? seconds * 1000 : null
}

const createQuotaError = (retryMs) => {
    const retryPart = retryMs
        ? ` Попробуйте снова через ${Math.ceil(retryMs / 1000)} сек.`
        : ""
    return new Error(
        `Квота Gemini исчерпана для текущего API ключа.${retryPart} Проверьте billing и лимиты: https://ai.google.dev/gemini-api/docs/rate-limits`,
    )
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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
    const body = {
        contents: mapMessagesToGemini(messages),
        generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
        },
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent?key=${GEMINI_API_KEY}`
    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    })

    if (!response.ok) {
        const errorBody = await response.text()
        let payload = null

        try {
            payload = JSON.parse(errorBody)
        } catch {
            payload = null
        }

        const isQuotaError =
            response.status === 429 ||
            payload?.error?.status === "RESOURCE_EXHAUSTED"
        if (isQuotaError) {
            const retryMs = parseRetryDelayMs(payload)

            if (retryMs && retryMs <= 5000) {
                await sleep(retryMs)
            }

            throw createQuotaError(retryMs)
        }

        throw new Error(
            `Gemini request failed: ${response.status} ${errorBody}`,
        )
    }

    const payload = await response.json()
    const text = extractTextFromGeminiResponse(payload)

    if (!text) {
        throw new Error("Gemini returned an empty response")
    }

    return {text}
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
