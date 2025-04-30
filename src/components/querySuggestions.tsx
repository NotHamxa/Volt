import {Label} from "@/components/ui/label.tsx";
import {getNameFromPath} from "@/scripts/query.ts";
import {CSSProperties, useEffect, useState} from "react";

interface IQuerySuggestions {
    bestMatch:string
    apps:string[]
    files:string[]
    folders:string[]
}

interface QueryComponentProps {
    path: string;
    onClick?: (path: string) => void;
    highlighted?: boolean; // manually-controlled highlight
}

export function QueryComponent({ path, highlighted = false }: QueryComponentProps) {
    const fileName = getNameFromPath(path);
    const [iconB64, setIconB64] = useState<string | null>(null);
    const [hovered, setHovered] = useState(false);

    useEffect(() => {
        const fetchIcon = async () => {
            if (fileName.endsWith(".exe") || fileName.endsWith(".lnk")) {
                const icon = await window.electron.getFileIcon(path);
                setIconB64(icon);
            }
        };
        fetchIcon();
    }, [fileName, path]);

    const isHighlighted = hovered || highlighted;

    return (
        <div
            onClick={() => {
                console.log("clicked",path);
                window.electron.openPath(path);
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                ...styles.componentContainer,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px',
                borderRadius: '8px',
                background: isHighlighted ? '#e0e0e0' : 'transparent',
                userSelect: 'none',
                transition: 'background 0.15s ease-in-out',
            }}
        >
            {iconB64 ? <img src={iconB64} style={{ width: 24, height: 24 }} /> : null}
            <Label>{fileName}</Label>
        </div>
    );
}

export default function QuerySuggestions({bestMatch,apps,files,folders}:IQuerySuggestions) {


    return (
        <div style={styles.mainContainer}>
            {bestMatch!==""?<>
                <Label>Best Match</Label>
                <QueryComponent path={bestMatch}/>
            </>:null}


        </div>
    )
}


const styles: { [key: string]: CSSProperties } = {
    mainContainer: {
        width: "100%",
        height: "100%",
        padding: "0 16px",
        boxSizing: "border-box",
    },
    componentContainer: {
        display: "flex",
        flexDirection: "row",
        gap: "8px",
        alignItems: "flex-start",
    },
}
