import {CSSProperties, useEffect, useState} from 'react';
import {Input} from "@/components/ui/input.tsx";
import {getQueryData} from "@/scripts/query.ts";
import {handleBangs} from "@/scripts/bangs.ts";
import QuerySuggestions from "@/components/querySuggestions.tsx";
import BangSuggestions from "@/components/bangSuggestions.tsx";
function App() {
    const [query, setQuery] = useState('');
    const [usingBangs,setUsingBangs] = useState(false);
    const [bestMatch, setBestMatch] = useState('');
    const [apps,setApps] = useState<string[]>([]);
    const [folders,setFolders] = useState<string[]>([]);
    const [files,setFiles] = useState<string[]>([]);
    const [currentHeight, setCurrentHeight] = useState<number>(125);
    useEffect(() => {
        document.documentElement.classList.add("dark");

        const handleBlur = () => {
            setQuery("");
            setUsingBangs(false);
            setBestMatch("");
            console.log("reset");
        };
        window.electron.onWindowBlurred(handleBlur);

        return () => {
        };
    }, []);

    useEffect(()=>{
        const getData = async ()=>{
            if (query===""){
                setBestMatch("")
                setUsingBangs(false);
                return;
            }
            if (query.startsWith("!")){
                setUsingBangs(true);
                return;
            }
            const queryData = await getQueryData({query,setBestMatch})
            setApps(queryData.apps)
            setFolders(queryData.folders)
            setFiles(queryData.files)
        }
        getData()
    },[query])

    useEffect(() => {
        if (!usingBangs && bestMatch){
            window.electron.setWindowHeight(500)
            setCurrentHeight(500);
        }
        else{
            window.electron.setWindowHeight(125)
            setCurrentHeight(125);
        }
    }, [usingBangs,bestMatch]);
    async function handleInputEnter() {
        if (query==="")
            return;
        if (usingBangs){
            handleBangs(query)
            setQuery("");
        }
    }

    return (
        <div style={{...styles.mainContainer,
                    ...{height:`${currentHeight}px`}}}>
            <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                style={styles.input}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        handleInputEnter();
                    }
                }}
                autoFocus={true}
            />

            {(!usingBangs && bestMatch)?
                <>
                <QuerySuggestions
                    bestMatch={bestMatch}
                    apps={apps}
                    files={files}
                    folders={folders}
                    />
                </>
                :null}
            {usingBangs?<BangSuggestions bang={query}/>:null}
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
