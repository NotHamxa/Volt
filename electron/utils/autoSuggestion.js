import https from "https";


export async function getGoogleSuggestions(query) {
    return new Promise((resolve) => {
        const url = `https://www.google.com/complete/search?q=${encodeURIComponent(query)}&cp=${query.length}&client=gws-wiz-serp&xssi=t&hl=en-PK`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const cleaned = data.replace(/^\)\]\}'\n/, '');
                    const parsed = JSON.parse(cleaned);
                    resolve(parsed[0].map(item => item[0]));
                } catch {
                    resolve([]);
                }
            });
        }).on('error', () => resolve([]));
    });
}
