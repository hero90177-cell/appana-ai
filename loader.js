// loader.js
export async function loadComponents() {
    console.log("🔄 Loader: Fetching components...");
    
    const components = [
        { id: "section-menu", html: "menu.html", css: "menu.css" },
        { id: "section-chat", html: "chat.html", css: "chat.css" },
        { id: "section-tools", html: "tools.html", css: "tools.css" }
    ];

    // We map the fetch operations into an array of Promises
    const promises = components.map(async (comp) => {
        try {
            // Fetch the HTML content
            const response = await fetch(comp.html);
            if (!response.ok) throw new Error(`Missing ${comp.html}`);
            
            const text = await response.text();
            const container = document.getElementById(comp.id);
            
            // Inject HTML immediately
            if (container) {
                container.innerHTML = text;
            }

            // Load CSS if not already present
            if (!document.querySelector(`link[href="${comp.css}"]`)) {
                const link = document.createElement("link");
                link.rel = "stylesheet";
                link.href = comp.css;
                document.head.appendChild(link);
            }

        } catch (err) {
            console.error(`❌ Load Error (${comp.id}):`, err);
            // Fallback UI so the screen isn't black
            const container = document.getElementById(comp.id);
            if (container) {
                container.innerHTML = `<div style="padding:20px; color:#ef4444; text-align:center;">
                    ⚠️ Failed to load ${comp.html}<br>
                    <small>${err.message}</small>
                </div>`;
            }
        }
    });

    // Wait for ALL components to finish loading/injecting before moving on
    await Promise.all(promises);
    console.log("✅ Loader: All Components Injected Successfully");
}
