import React from 'react';
import { MapPin, X, Navigation } from 'lucide-react';

const LocationPermissionModal = ({ isOpen, onClose, onRequestLocation, isLoading }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400">
          <X size={20} />
        </button>

        <div className="text-center mb-4">
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Navigation size={32} className="text-purple-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-800 mb-2">Find Events Near You</h3>
          <p className="text-gray-600 text-sm">Allow location access to discover events around you.</p>
        </div>

        <div className="space-y-3">
          <button
            onClick={onRequestLocation}
            disabled={isLoading}
            className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                Getting Location...
              </>
            ) : (
              <>
                <MapPin size={16} className="mr-2" />
                Allow Location Access
              </>
            )}
          </button>
          
          <button onClick={onClose} className="w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-medium">
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
};

export default LocationPermissionModal;
