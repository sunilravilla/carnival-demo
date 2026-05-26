import { useState } from 'react';
import GuestHeader from './GuestHeader';
import HeroBanner from './HeroBanner';
import VoyageProgressBar from './VoyageProgressBar';
import TodayCard from './TodayCard';
import ReservationWidget from './ReservationWidget';
import FolioWidget from './FolioWidget';
import QuickActions from './QuickActions';
import MarinaChatBubble from './MarinaChatBubble';
import MarinaPanel from './MarinaPanel';
import ShakeForChampagne from '../champagne/ShakeForChampagne';
import TonightsLook from '../style/TonightsLook';
import NowPlayingManor from '../music/NowPlayingManor';
import RockStarPerks from './RockStarPerks';
import { isVirgin } from '../../styles/branding';

const S = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100dvh',
    background: '#f7f4f0',
    overflowX: 'hidden',
    position: 'relative',
  },
  scroll: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    WebkitOverflowScrolling: 'touch',
    paddingBottom: 100,
  },
};

export default function DashboardPage({ onAdminClick, onSwitchGuest, isCheckingAuth }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [prefilledMessage, setPrefilledMessage] = useState('');

  const openMarinaPanelWithMessage = (msg) => {
    setPrefilledMessage(msg);
    setPanelOpen(true);
  };


  return (
    <div style={S.root}>
      <GuestHeader
        onAdminClick={onAdminClick}
        onSwitchGuest={onSwitchGuest}
        isCheckingAuth={isCheckingAuth}
      />

      <div style={S.scroll}>
        <HeroBanner />
        <VoyageProgressBar />
        <TodayCard />
        {isVirgin && <RockStarPerks />}
        {isVirgin && <TonightsLook onAction={openMarinaPanelWithMessage} />}
        {isVirgin && <ShakeForChampagne />}
        {isVirgin && <NowPlayingManor />}
        <ReservationWidget />
        <FolioWidget />
        <QuickActions onAction={openMarinaPanelWithMessage} />
        {/* Bottom spacer so content doesn't hide behind the chat bubble */}
        <div style={{ height: 16 }} />
      </div>

      {/* Marina floating bubble */}
      <MarinaChatBubble onOpen={() => setPanelOpen(true)} />

      {/* Marina sliding panel — always mounted */}
      <MarinaPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        prefilledMessage={prefilledMessage}
        onPrefilledUsed={() => setPrefilledMessage('')}
      />
    </div>
  );
}
