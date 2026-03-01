import { useOutletContext } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import PinnedApps from "@/components/pinnedAppsComponent.tsx";
import { MainLayoutContext } from "@/pages/mainPage.tsx";

export default function HomePage() {
    const navigate = useNavigate();
    const { apps, pinnedApps, setPinnedApps, unPinApp } = useOutletContext<MainLayoutContext>();

    return (
        <motion.div
            key="home"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="w-full h-full"
        >
            <PinnedApps
                apps={apps}
                pinnedApps={pinnedApps}
                setPinnedApps={setPinnedApps}
                setStage={() => navigate('/all')}
                unPinApp={unPinApp}
            />
        </motion.div>
    );
}
