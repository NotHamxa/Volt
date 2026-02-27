import { useOutletContext, useSearchParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { SearchQueryT } from "@/interfaces/searchQuery.ts";
import AllApps from "@/components/allAppsComponent.tsx";
import { MainLayoutContext } from "@/pages/mainPage.tsx";

export default function AllAppsPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const query = searchParams.get('query') || '';
    const { apps, pinnedApps, pinApp, unPinApp } = useOutletContext<MainLayoutContext>();
    const [filteredApps, setFilteredApps] = useState<SearchQueryT[]>([]);

    useEffect(() => {
        const q = query.toLowerCase();
        setFilteredApps(apps.filter(app => app.name.toLowerCase().includes(q)));
    }, [query, apps]);

    return (
        <motion.div
            key="all-apps"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{ width: "100%", height: "100%" }}
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
