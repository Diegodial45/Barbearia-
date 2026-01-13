import React from 'react';
import { Service } from '../types';

interface ServiceCardProps {
  service: Service;
  selected: boolean;
  onSelect: (service: Service) => void;
}

export const ServiceCard: React.FC<ServiceCardProps> = ({ service, selected, onSelect }) => {
  return (
    <div 
      onClick={() => onSelect(service)}
      className={`
        relative overflow-hidden rounded-xl cursor-pointer transition-all duration-300 transform hover:scale-105
        ${selected 
          ? 'ring-4 ring-cyan-400 bg-slate-800 shadow-[0_0_20px_rgba(34,211,238,0.5)]' 
          : 'bg-slate-800/50 hover:bg-slate-800 border border-slate-700'}
      `}
    >
      <div className="h-32 w-full overflow-hidden">
        <img src={service.image} alt={service.name} className="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity" />
      </div>
      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-xl font-bold text-white">{service.name}</h3>
          <span className="bg-fuchsia-500 text-white text-xs font-bold px-2 py-1 rounded-full">
            R$ {service.price}
          </span>
        </div>
        <p className="text-slate-400 text-sm mb-3 line-clamp-2">{service.description}</p>
        <div className="flex items-center text-cyan-400 text-sm font-semibold">
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          {service.durationMinutes} min
        </div>
      </div>
      
      {selected && (
        <div className="absolute top-2 right-2 bg-cyan-400 rounded-full p-1 shadow-lg">
          <svg className="w-4 h-4 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
        </div>
      )}
    </div>
  );
};