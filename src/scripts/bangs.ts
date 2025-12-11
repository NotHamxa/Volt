import bangs from "@/data/bangs.json";
import {BangData} from "@/interfaces/bang.ts";
import {SearchHistoryT} from "@/interfaces/history.ts";

async function handleBangs(query: string) {
    console.log(bangs.length);
    const trimmedQuery = query.trim();
    const words = trimmedQuery.split(" ");
    const possibleBang = words[words.length - 1];
    const shortcut = possibleBang.startsWith("!") ? possibleBang.slice(1) : null;

    let bangData = bangs.find((bang) => bang.t === shortcut);

    let searchTerm = words.slice(0, -1).join(" ");
    if (words.length === 1 && shortcut) {
        searchTerm = "";
    }
    if (!bangData) {
        bangData = bangs.find((bang) => bang.t === "g");
    }

    if (bangData) {
        const url = bangData.u.replace("{{{s}}}", encodeURIComponent(searchTerm));
        const historyEntry: SearchHistoryT = {
            searchTerm: searchTerm,
            searchUrl: url,
            site: bangData.s,
        };

        const stored = await window.electronStore.get("searchHistory");
        let searchHistory: SearchHistoryT[] = stored ? JSON.parse(stored) : [];
        const existingIndex = searchHistory.findIndex(item => JSON.stringify(item) === JSON.stringify(historyEntry));
        if (existingIndex !== -1) {
            searchHistory.splice(existingIndex, 1);
        }
        if (searchHistory.length < 20) {
            searchHistory = [historyEntry, ...searchHistory];
        } else {
            searchHistory = [historyEntry, ...searchHistory.slice(0, 19)];
        }

        window.electronStore.set("searchHistory", JSON.stringify(searchHistory));
        window.electron.openExternal(url);
    }
}

async function handleHistoryItem(item: SearchHistoryT) {
    const stored = await window.electronStore.get("searchHistory");
    let searchHistory: SearchHistoryT[] = stored ? JSON.parse(stored) : [];

    searchHistory = searchHistory.filter(entry => JSON.stringify(entry) !== JSON.stringify(item));
    searchHistory.unshift(item);

    window.electronStore.set("searchHistory", JSON.stringify(searchHistory));
    window.electron.openExternal(item.searchUrl);

}

async function getBangData(query: string): Promise<BangData | null> {
    const words = query.trim().split(" ");
    const possibleBang = words[words.length - 1];
    const shortcut = possibleBang.startsWith("!") ? possibleBang.slice(1) : null;

    const bangData = bangs.find((bang) => bang.t === shortcut);
    return bangData as BangData ?? null;
}


export {
    handleBangs,
    getBangData,
    handleHistoryItem
};

