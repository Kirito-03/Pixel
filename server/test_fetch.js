(async () => {
    console.log("Testeando conexión a Hentaila...");
    try {
        const res = await fetch('https://hentaila.com/media/onaji-semi-no-someya-san-ga-sexy-joyuu-datta-hanashi/1');
        console.log("Status:", res.status);
        const html = await res.text();
        const match = html.match(/\{type:"data",data:(\{media:\{.*?\}\}),uses:/);
        if (match) {
            console.log("✅ Regex Match OK!");
            const dataObj = eval('(' + match[1].replace(/void 0/g, 'null') + ')');
            console.log("Synopsis:", dataObj.media.synopsis ? "Found" : "Missing");
            console.log("Genres:", dataObj.media.genres?.length || 0);
            console.log("Episodes:", dataObj.media.episodes?.length || 0);
        } else {
            console.log("❌ Regex failed. HTML preview:");
            console.log(html.substring(0, 500));
        }
    } catch (e) {
        console.error("Fetch error:", e);
    }
})();
