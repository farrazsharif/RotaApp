import { useRef, useState } from 'react';
import Avatar from './Avatar';
import { fileToAvatarDataUrl } from '../lib/image';

interface Props {
  photo?: string;
  firstName: string;
  lastName: string;
  onChange: (photo: string | undefined) => void;
}

export default function PhotoUpload({ photo, firstName, lastName, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  async function handleFile(file: File) {
    setError('');
    if (!file.type.startsWith('image/')) { setError('Please choose an image file.'); return; }
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      onChange(dataUrl);
    } catch {
      setError('Could not process that image.');
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar photo={photo} firstName={firstName || '?'} lastName={lastName || ''} size="xl" />
      <div className="space-y-1">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />
        <div className="flex gap-2">
          <button type="button" className="btn-secondary btn btn-sm" onClick={() => inputRef.current?.click()}>
            {photo ? 'Change photo' : 'Upload photo'}
          </button>
          {photo && (
            <button type="button" className="text-sm text-red-600 hover:underline" onClick={() => onChange(undefined)}>
              Remove
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400">JPG or PNG. Cropped to a square.</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
