import { useOutletContext, useSearchParams, useNavigate } from 'react-router';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { SearchQueryT } from "@/interfaces/searchQuery.ts";
import AllApps from "@/components/allAppsComponent.tsx";
import { MainLayoutContext } from "@/pages/mainPage.tsx";

export default function AllAppsPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const query = searchParams.get('query') || '';
    const { apps, pinnedApps, pinApp, unPinApp } = useOutletContext<MainLayoutContext>();
    const filteredApps = useMemo<SearchQueryT[]>(() => {
        const q = query.toLowerCase();
        return apps.filter(app => app.name.toLowerCase().includes(q));
    }, [query, apps]);

    return (
        <motion.div
            key="all-apps"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="w-full flex-1 min-h-0"
        >
            <AllApps
                setStage={() => navigate('/')}
                apps={filteredApps}
                pinnedApps={pinnedApps}
                pinApp={pinApp}
                unPinApp={unPinApp}
            />
        </motion.div>
    );
}
