import {useEffect, useState} from "react";
import {SearchQueryT} from "@/interfaces/searchQuery.ts";
import {Button} from "@/components/ui/button.tsx";
import {AppWindowIcon, ChevronRight} from "lucide-react";


function PinnedApp({ app }: { app: SearchQueryT }) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                width: '100px',
                height: '85px',
                backgroundColor: 'transparent',
                borderRadius: '8px',
                transition: 'background-color 0.3s ease',
                cursor: 'pointer',
                flexDirection: 'column',
                overflow: 'hidden',
                textAlign: 'center',

            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#353737'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
            <AppWindowIcon size={24} />
            <label style={{ marginTop: '8px', fontSize: '12px' }}>{app.name}</label>
        </div>
    );
}



export default function PinnedSuggestedApps({ setStage}: { setStage: (n: number) => void}){
    const [pinnedApps,setPinnedApps]=useState<SearchQueryT[]>([])
    useEffect(() => {
        const getApps= async () => {
            const pinnedApps = await window.electronStore.get("pinnedApps")
            if (pinnedApps){
                setPinnedApps(JSON.parse(pinnedApps));
            }
            else {
                setPinnedApps([]);
            }
        }
        getApps()

    }, []);
    return (
        <>
            <div style={{height: "350px", display: "flex", flexDirection: "column" }}>
                <div style={{
                    display: "flex",
                    color: "#ffffff",
                    fontWeight: "bold",
                    fontSize: "16px",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingRight: "10px",
                }}>
                    <span style={{margin: "0 12px"}}>Pinned Apps</span>
                    <Button
                        variant="ghost"
                        className="bg-[#2b2b2b] hover:bg-[#3a3a3a] text-white px-3 py-1 h-auto text-sm rounded-md flex items-center gap-1"
                        onClick={() => {
                            setStage(2)
                        }}
                    >
                        All
                        <ChevronRight className="w-3 h-3"/>
                    </Button>
                </div>
                {pinnedApps?.length > 0 ?
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(6, 120px)",
                            height: "100%",
                            gridAutoRows: "minmax(105px, 105px)",
                        }}
                    >
                        {pinnedApps?.map((app: SearchQueryT) => (<PinnedApp app={app}/>))}
                    </div> :
                    <div style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}>
                        <label>No Apps Pinned</label>
                    </div>
                }
            </div>
            <div style={{height: "100%"}}>
                <div style={{
                    display: "flex",
                    color: "#ffffff",
                    fontWeight: "bold",
                    fontSize: "16px",
                }}>
                    <span style={{margin: "0 12px"}}>Suggested</span>
                </div>
                {/* Content below */}
            </div>
        </>
    )
}
