import React, {CSSProperties, useEffect, useState} from "react";
import {motion} from "framer-motion";
import {SearchQueryT} from "@/interfaces/searchQuery.ts";
import AllApps from "@/components/allAppsComponent.tsx";
import PinnedApps from "@/components/pinnedAppsComponent.tsx";
import {showToast} from "@/components/toast.tsx";


const isSameApp = (a: SearchQueryT, b: SearchQueryT) => {
    return (
        a.appId === b.appId &&
        a.path === b.path &&
        a.name === b.name &&
        a.type === b.type &&
        a.source === b.source
    );
};

interface IHomepage{
    stage:number;
    setStage:React.Dispatch<React.SetStateAction<number>>;
    query:string;
}

export default function HomePageComponent({stage,setStage,query}:IHomepage) {
    const [apps, setApps] = useState<SearchQueryT[]>([])
    const [pinnedApps, setPinnedApps] = useState<SearchQueryT[]>([]);
    const [filteredApps, setFilteredApps] = useState<SearchQueryT[]>([]);

    useEffect(() => {
        const getAppData = async () => {
            const apps = await window.apps.searchApps("")
            setApps(apps)
            const pApps = await window.electronStore.get("pinnedApps")
            setPinnedApps(pApps?JSON.parse(pApps):[]);}
        getAppData()
        window.electron.onCacheReload(getAppData)
    }, []);

    useEffect(() => {
        const q = query.toLowerCase();
        const matched = apps.filter(app =>
            app.name.toLowerCase().includes(q)
        );
        setFilteredApps(matched);
    }, [query, apps]);
    const pinApp = async (app: SearchQueryT) => {
        if (pinnedApps.length === 21) {
            showToast("Maximum Pins Reached", "You can pin up to 21 apps only.");
            return;
        }
        if (!pinnedApps.find((a) => isSameApp(a, app))) {
            const updated = [...pinnedApps, app];
            window.electronStore.set("pinnedApps", JSON.stringify(updated));
            setPinnedApps(updated);
        }
    };
    const unPinApp = async (app: SearchQueryT) => {
        const updated = pinnedApps.filter((a) => !isSameApp(a, app));
        window.electronStore.set("pinnedApps", JSON.stringify(updated));
        setPinnedApps(updated);
    };

    return (
        <motion.div
            key={stage}
            initial={{opacity: 0, x: stage===1?-50:50}}
            animate={{opacity: 1, x: 0}}
            exit={{opacity: 0, x: stage===1?50:-50}}
            transition={{duration: 0.3, ease: "easeInOut"}}
            style={styles.mainContainer}
        >
            {stage === 1
                ? <PinnedApps
                    apps={apps}
                    pinnedApps={pinnedApps}
                    setPinnedApps={setPinnedApps}
                    setStage={setStage}
                    unPinApp={unPinApp}
                />
                : <AllApps
                    setStage={setStage}
                    apps={filteredApps}
                    pinnedApps={pinnedApps}
                    pinApp={pinApp}
                    unPinApp={unPinApp}
                />}



        </motion.div>
    )

}


const styles: { [key: string]: CSSProperties } = {

    mainContainer: {
        width: "100%",
        height: "100%",
    }
}
