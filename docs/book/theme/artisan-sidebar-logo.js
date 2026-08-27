;(() => {
    const scriptUrl = document.currentScript?.src
    const logoSrc = scriptUrl ? new URL("../artisan-made-logo.png", scriptUrl).href : "artisan-made-logo.png"

    const addSidebarLogo = () => {
        const sidebar = document.querySelector(".sidebar-scrollbox")

        if (!sidebar || sidebar.querySelector(".artisan-sidebar-logo")) {
            return
        }

        const link = document.createElement("a")
        link.className = "artisan-sidebar-logo"
        link.href = "https://github.com/artisansdk/architect"
        link.setAttribute("aria-label", "Artisan Made, Co.")

        const image = document.createElement("img")
        image.src = logoSrc
        image.alt = "Artisan Made"

        link.append(image)
        sidebar.prepend(link)
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", addSidebarLogo, { once: true })
    } else {
        addSidebarLogo()
    }
})()
