const { execSync } = require("child_process")

const { config } = require("dotenv")

for (const envFile of [".env.local", ".env"]) {
    config({ path: `../${envFile}` })
}

const getEnvBool = (key, fallback=false) => {
    const value = process.env[key]
    if (value === "false" || value === "0" || value === "off") {
        return false
    }
    if (value === "true" || value === "1" || value === "on") {
        return true
    }
    return fallback
}

let git_hash
try {
    git_hash = execSync("git rev-parse HEAD").toString().trim()
} catch (error) {
    console.log("Unable to get git hash, assume running inside Docker")
    git_hash = "abc123"
}

const { withPlausibleProxy } = require("next-plausible")

const withPWA = require("next-pwa")({
    dest: "public",
    disable: !getEnvBool("FRONTEND_PWA"),
})
const removeImports = require("next-remove-imports")({
    //test: /node_modules([\s\S]*?)\.(tsx|ts|js|mjs|jsx)$/,
    //matchImports: "\\.(less|css|scss|sass|styl)$"
})

const mediaUrl = new URL(process.env.MEDIA_URL ?? "http://localhost")

let app = withPlausibleProxy({
    customDomain: "https://stats.decomp.me",
})(removeImports(withPWA({
    async redirects() {
        return [
            {
                source: "/scratch",
                destination: "/",
                permanent: true,
            },
            {
                source: "/scratch/new",
                destination: "/new",
                permanent: true,
            },
            {
                source: "/settings",
                destination: "/settings/account",
                permanent: false,
            },
        ]
    },
    async rewrites() {
        return []
    },
    async headers() {
        return [
            {
                source: "/(.*)", // all routes
                headers: [
                    {
                        key: "X-DNS-Prefetch-Control",
                        value: "on",
                    },
                    {
                        key: "Cross-Origin-Opener-Policy",
                        value:"same-origin",
                    },
                    {
                        key: "Cross-Origin-Embedder-Policy",
                        value: "require-corp",
                    },
                ],
            },
        ]
    },
    webpack(config) {
        config.module.rules.push({
            test: /\.svg$/,
            use: ["@svgr/webpack"],
        })

        // @open-rpc/client-js brings in some dependencies which, in turn, have optional dependencies.
        // This confuses the heck out of webpack, so tell it should just sub in a CommonJS-style "require" statement
        // instead (which will fail and trigger the fallback at runtime)
        // https://stackoverflow.com/questions/58697934/webpack-how-do-you-require-an-optional-dependency-in-bundle-saslprep
        config.externals.push({
            "encoding": "commonjs encoding",
            "bufferutil": "commonjs bufferutil",
            "utf-8-validate": "commonjs utf-8-validate",
        })

        // All of the vscode-* packages (jsonrpc, languageserver-protocol, etc.) are distributed as UMD modules.
        // This also leaves webpack with no idea how to handle require statements.
        // umd-compat-loader strips away the hedaer UMD adds to allow browsers to parse ES modules
        // and just treats the importee as an ES module.
        config.module.rules.push({
            "test": /node_modules[\\|/](vscode-.*)/,
            "use": {
                "loader": "umd-compat-loader",
            },
        })

        return config
    },
    images: {
        domains: [mediaUrl.hostname, "avatars.githubusercontent.com"],
        unoptimized: !getEnvBool("FRONTEND_USE_IMAGE_PROXY"),
    },
    swcMinify: true,
    experimental: {
        appDir: true,
    },
    env: {
        // XXX: don't need 'NEXT_PUBLIC_' prefix here; we could just use 'API_BASE' and 'GITHUB_CLIENT_ID'
        // See note at top of https://nextjs.org/docs/api-reference/next.config.js/environment-variables for more information
        NEXT_PUBLIC_API_BASE: process.env.API_BASE,
        NEXT_PUBLIC_GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
        NEXT_PUBLIC_COMMIT_HASH: git_hash,
    },
})))

if (process.env.ANALYZE == "true") {
    app = require("@next/bundle-analyzer")(app)
}

module.exports = app
