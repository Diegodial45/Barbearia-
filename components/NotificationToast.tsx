import React, { useEffect, useState } from 'react';

interface NotificationToastProps {
  message: string;
  isVisible: boolean;
  onClose: () => void;
  type?: 'success' | 'info';
}

export const NotificationToast: React.FC<NotificationToastProps> = ({ message, isVisible, onClose, type = 'success' }) => {
  const [show, setShow] = useState(isVisible);

  useEffect(() => {
    setShow(isVisible);
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  if (!show) return null;

  return (
    <div className="fixed top-4 right-4 z-50 animate-bounce-in">
      <div className={`
        flex items-center p-4 rounded-lg shadow-2xl border-l-4 backdrop-blur-md
        ${type === 'success' ? 'bg-slate-900/90 border-cyan-400 text-white' : 'bg-slate-900/90 border-fuchsia-500 text-white'}
      `}>
        <div className={`rounded-full p-2 mr-3 ${type === 'success' ? 'bg-cyan-400/20 text-cyan-400' : 'bg-fuchsia-500/20 text-fuchsia-500'}`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
          </svg>
        </div>
        <div>
          <h4 className="font-bold text-sm uppercase tracking-wider mb-1">
            {type === 'success' ? 'Agendamento Confirmado' : 'Atualização'}
          </h4>
          <p className="text-sm font-light">{message}</p>
        </div>
        <button onClick={onClose} className="ml-4 text-slate-400 hover:text-white">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>
    </div>
  );
};