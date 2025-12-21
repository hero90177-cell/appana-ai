// loader.js
export async function loadComponents() {
    const components = [
        { id: "section-menu", html: "menu.html", css: "menu.css" },
        { id: "section-chat", html: "chat.html", css: "chat.css" },
        { id: "section-tools", html: "tools.html", css: "tools.css" }
    ];

    const promises = components.map(async (comp) => {
        // 1. Fetch HTML Content
        try {
            const response = await fetch(comp.html);
            if (!response.ok) throw new Error(`Failed to load ${comp.html}`);
            const text = await response.text();

            const container = document.getElementById(comp.id);
            if (container) container.innerHTML = text;
        } catch (err) {
            console.error(err);
        }

        // 2. Load CSS dynamically (if not already loaded)
        if (!document.querySelector(`link[href="${comp.css}"]`)) {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = comp.css;
            document.head.appendChild(link);
        }
    });

    await Promise.all(promises);
    console.log("✅ All UI Components Loaded Successfully");
}