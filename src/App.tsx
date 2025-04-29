import {CSSProperties, useEffect, useState} from 'react';
import {Input} from "@/components/ui/input.tsx";
import bangs from "./data/bangs.json"
function App() {
    const [query, setQuery] = useState('');
    useEffect(() => {
        document.documentElement.classList.add("dark");
    }, []);

    function handleSearchQuery() {
        const trimmedQuery = query.trim();

        if (trimmedQuery === "") return;

        if (trimmedQuery.startsWith("!")) {
            const shortcut = trimmedQuery.split(" ")[0].replace("!","");

            const bangData = bangs.find((bang) => bang.t === shortcut);
            const searchTerm = trimmedQuery.slice(shortcut.length+1).trim();
            let url = ""
            if (bangData) {
                url = bangData.u.replace("{{{s}}}", encodeURIComponent(searchTerm));
            } else {
                const bangData = bangs.find((bang) => bang.t === "g");
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-expect-error
                url = bangData.u.replace("{{{s}}}", encodeURIComponent(searchTerm));
            }
            window.electron.openExternal(url)
        }

        setQuery("");
    }

    return (
        <div style={styles.mainContainer}>
            <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                style={styles.input}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        handleSearchQuery();
                    }
                }}
                autoFocus={true}
            />

        </div>
    );
}

const styles: { [key: string]: CSSProperties } = {
    mainContainer: {
        width: '600px',
        maxWidth: '600px',
        height: '100px',
        overflow: 'hidden',
    },
    input: {
        width: '80%',
        margin: '10px auto',
        display: 'block',
    }
}

export default App;
