import { CSSProperties, useEffect, useState } from "react";
import { getBangData } from "@/scripts/bangs.ts";
import { BangData } from "@/interfaces/bang.ts";

export default function BangSuggestions({ bang }: { bang: string }) {
    const [bangData, setBangData] = useState<BangData | null>(null);
    const [searchTerm, setSearchTerm] = useState<string>("");

    useEffect(() => {
        const checkBang = async () => {
            const bangData = await getBangData(bang);
            setBangData(bangData);
            if (bangData) {
                setSearchTerm(bang.slice(bangData.t.length + 1).trim());
            } else {
                setSearchTerm("");
            }
        };
        checkBang();
    }, [bang]);

    const faviconUrl = bangData?.d
        ? `https://www.google.com/s2/favicons?sz=24&domain_url=${encodeURIComponent(bangData.d)}`
        : null;

    return (
        <div style={styles.mainContainer}>
            {bangData && (
                <div style={styles.headingContainer}>
                    <div style={styles.titleRow}>
                        {faviconUrl && <img src={faviconUrl} style={styles.favicon} />}
                        <h2 style={styles.heading}>{bangData.s}</h2>
                    </div>
                    {searchTerm && <span style={styles.searchTerm}>{searchTerm}</span>}
                </div>
            )}
        </div>
    );
}

const styles: { [key: string]: CSSProperties } = {
    mainContainer: {
        width: "100%",
        height: "100%",
        padding: "0 16px",
        boxSizing: "border-box",
    },
    headingContainer: {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: "4px",
    },
    titleRow: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
    },
    favicon: {
        width: 24,
        height: 24,
    },
    heading: {
        fontSize: "20px",
        fontWeight: "bold",
        margin: 0,
        color: "#fff",
    },
    searchTerm: {
        fontSize: "14px",
        color: "#aaa",
    },
};
