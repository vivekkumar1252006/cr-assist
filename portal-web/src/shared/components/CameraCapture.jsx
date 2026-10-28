import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, RefreshCw, SwitchCamera } from 'lucide-react';
import { Modal } from '@shared/components/Modal.jsx';

export const canUseLiveCamera = () => Boolean(navigator.mediaDevices?.getUserMedia) && window.isSecureContext;

/**
 * Takes a new photo with the device camera (getUserMedia). Produces a JPEG File via onCapture.
 * The caller falls back to <input capture> when live camera access isn't available.
 */
export default function CameraCapture({ open, onClose, onCapture, onUnavailable }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [facing, setFacing] = useState('environment');
  const [state, setState] = useState('starting'); // starting | ready | error
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null); // { url, blob }

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!open || preview) return undefined;
    let cancelled = false;
    setState('starting');
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 } }, audio: false })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        setState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setState('error');
        setError(
          err.name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow camera access in your browser settings, or choose an existing photo instead.'
            : err.name === 'NotFoundError'
              ? 'No camera was found on this device.'
              : 'The camera could not be started.',
        );
      });
    return () => {
      cancelled = true;
      stop();
    };
  }, [open, facing, preview, stop]);

  useEffect(() => () => preview && URL.revokeObjectURL(preview.url), [preview]);

  function snap() {
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      stop();
      setPreview({ url: URL.createObjectURL(blob), blob });
    }, 'image/jpeg', 0.9);
  }

  function usePhoto() {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    onCapture(new File([preview.blob], `camera-${stamp}.jpg`, { type: 'image/jpeg' }));
    close();
  }

  function close() {
    stop();
    setPreview(null);
    setError('');
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Take a new photo"
      size="lg"
      footer={
        preview ? (
          <>
            <button onClick={() => setPreview(null)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <RefreshCw className="h-4 w-4" /> Retake
            </button>
            <button onClick={usePhoto} className="inline-flex items-center justify-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-800">
              Use this photo
            </button>
          </>
        ) : state === 'error' ? (
          <button
            onClick={() => {
              close();
              onUnavailable?.();
            }}
            className="rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-800"
          >
            Use device camera / file picker instead
          </button>
        ) : (
          <>
            <button
              onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
              disabled={state !== 'ready'}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <SwitchCamera className="h-4 w-4" /> Switch camera
            </button>
            <button onClick={snap} disabled={state !== 'ready'} className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50">
              <Camera className="h-4 w-4" /> Capture
            </button>
          </>
        )
      }
    >
      <div className="relative grid aspect-video place-items-center overflow-hidden rounded-xl bg-navy-950">
        {preview ? (
          <img src={preview.url} alt="Captured photo preview" className="h-full w-full object-contain" />
        ) : state === 'error' ? (
          <p className="px-6 text-center text-sm text-navy-100">{error}</p>
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-contain" />
            {state === 'starting' && <Loader2 className="absolute h-8 w-8 animate-spin text-teal-300" />}
          </>
        )}
      </div>
    </Modal>
  );
}
