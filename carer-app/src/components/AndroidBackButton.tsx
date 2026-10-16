import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

// Android's hardware back button closes the app by default. For a carer that
// means being thrown out mid-visit, so handle it: go back through the app, and
// only minimise (never kill) when already on a main tab.
const ROOT_TABS = ['/', '/rota', '/history', '/profile'];

export default function AndroidBackButton() {
  const navigate = useNavigate();

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let remove: (() => void) | undefined;

    CapApp.addListener('backButton', ({ canGoBack }) => {
      if (ROOT_TABS.includes(window.location.pathname)) {
        // On a main tab there's nowhere sensible to go back to. Minimise rather
        // than exit, so an in-progress visit isn't lost from view.
        void CapApp.minimizeApp();
      } else if (canGoBack) {
        window.history.back();
      } else {
        navigate('/');
      }
    }).then((handle) => {
      remove = () => { void handle.remove(); };
    });

    return () => { remove?.(); };
  }, [navigate]);

  return null;
}
