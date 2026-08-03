import { useOutletContext } from 'react-router';
import { useNavigate } from 'react-router';
import PinnedApps from "@/components/pinnedAppsComponent.tsx";
import RecentSearches from "@/components/recentSearches.tsx";
import TipBar from "@/components/tipBar.tsx";
import { MainLayoutContext } from "@/pages/mainPage.tsx";

export default function HomePage() {
    const navigate = useNavigate();
    const { pinnedApps, setPinnedApps, unPinApp } = useOutletContext<MainLayoutContext>();

    return (
        <div
            className="w-full h-full flex flex-col relative"
        >
            <div className="flex-1 min-h-0 flex flex-col">
                <PinnedApps
                    pinnedApps={pinnedApps}
                    setPinnedApps={setPinnedApps}
                    setStage={() => navigate('/all')}
                    unPinApp={unPinApp}
                />
            </div>
            <RecentSearches />
            <TipBar />
        </div>
    );
}
