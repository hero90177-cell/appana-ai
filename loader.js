// loader.js
export async function loadComponents() {
    const components = [
        { id: "section-menu", html: "menu.html", css: "menu.css" },
        { id: "section-chat", html: "chat.html", css: "chat.css" },
        { id: "section-tools", html: "tools.html", css: "tools.css" }
    ];

    const promises = components.map(async (comp) => {
        try {
            // ❌ Removed ?v= timestamp to allow Service Worker cache to work
            const response = await fetch(comp.html);
            
            if (!response.ok) throw new Error(`Missing ${comp.html}`);
            const text = await response.text();

            const container = document.getElementById(comp.id);
            if (container) {
                container.innerHTML = text;
            }
        } catch (err) {
            console.error(`Load Error (${comp.id}):`, err);
            // Fallback: If loading fails, show error in the box so it's not black
            const container = document.getElementById(comp.id);
            if (container) {
                container.innerHTML = `<div style="padding:20px; color:#ef4444;">⚠️ Failed to load ${comp.html}</div>`;
            }
        }

        // Load CSS
        if (!document.querySelector(`link[href="${comp.css}"]`)) {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = comp.css;
            document.head.appendChild(link);
        }
    });

    await Promise.all(promises);
    console.log("✅ Components Loaded");
}
