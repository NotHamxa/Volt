import {CSSProperties, useEffect, useState} from "react";
import {motion} from "framer-motion";
import {SearchQueryT} from "@/interfaces/searchQuery.ts";
import AllApps from "@/components/allAppsComponent.tsx";
import PinnedSuggestedApps from "@/components/pinnedSuggestedAppsComponent.tsx";


const isSameApp = (a: SearchQueryT, b: SearchQueryT) => {
    return (
        a.appId === b.appId &&
        a.path === b.path &&
        a.name === b.name &&
        a.type === b.type &&
        a.source === b.source
    );
};



export default function HomePageComponent() {

    const [stage, setStage] = useState<number>(1)

    const [apps, setApps] = useState<SearchQueryT[]>([])
    const [pinnedApps, setPinnedApps] = useState<SearchQueryT[]>([]);

    useEffect(() => {
        const getAppData = async () => {
            const apps = await window.electron.searchApps("")
            setApps(apps)
            const pApps = await window.electronStore.get("pinnedApps")
            setPinnedApps(pApps?JSON.parse(pApps):[]);
        }
        getAppData()
    }, []);
    const pinApp = async (app: SearchQueryT) => {
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
                ? <PinnedSuggestedApps setStage={setStage}/>
                : <AllApps
                    setStage={setStage}
                    apps={apps}
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
