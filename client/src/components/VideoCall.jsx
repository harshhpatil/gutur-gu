import { useCallback, useEffect, useRef, useState } from "react";

const ICE_SERVERS = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const CALL_STATUS = {
  IDLE: "idle",
  WAITING: "waiting",
  IN_CALL: "in-call",
};

function VideoCall({ socket }) {
  const [popupData, setPopupData] = useState(null);
  const [callStatus, setCallStatus] = useState(CALL_STATUS.IDLE);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnection = useRef(null);
  const localStreamRef = useRef(null);

  const cleanupCall = useCallback(() => {
    if (peerConnection.current) {
      peerConnection.current.ontrack = null;
      peerConnection.current.onicecandidate = null;
      peerConnection.current.close();
      peerConnection.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    setPopupData(null);
    setCallStatus(CALL_STATUS.IDLE);
  }, []);

  const createPeerConnection = useCallback(() => {
    const connection = new RTCPeerConnection(ICE_SERVERS);

    connection.ontrack = (event) => {
      const [remoteStream] = event.streams;

      if (remoteVideoRef.current && remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
    };

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        socket?.emit("webrtc_ice_candidate", event.candidate);
      }
    };

    peerConnection.current = connection;
    return connection;
  }, [socket]);

  const initiateCall = useCallback(
    async (isCaller) => {
      try {
        setPopupData(null);
        setCallStatus(CALL_STATUS.IN_CALL);

        // Capacitor WebViews support the standard getUserMedia Promise API.
        const localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        localStreamRef.current = localStream;

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }

        const connection = peerConnection.current || createPeerConnection();

        localStream.getTracks().forEach((track) => {
          connection.addTrack(track, localStream);
        });

        if (isCaller) {
          const offer = await connection.createOffer();
          await connection.setLocalDescription(offer);
          socket?.emit("webrtc_offer", offer);
        }
      } catch (error) {
        console.error("Failed to initiate video call:", error);
        cleanupCall();
      }
    },
    [cleanupCall, createPeerConnection, socket],
  );

  const ensureReceiverConnection = useCallback(async () => {
    if (!peerConnection.current) {
      await initiateCall(false);
    }

    return peerConnection.current;
  }, [initiateCall]);

  useEffect(() => {
    if (!socket) return undefined;

    const handleTriggerPopup = (data) => {
      setPopupData({
        title: data.title,
        scheduleId: data.scheduleId,
      });
      setCallStatus(CALL_STATUS.IDLE);
    };

    const handleStartVideo = () => {
      initiateCall(true);
    };

    const handleCancelCall = () => {
      cleanupCall();
    };

    const handleWebrtcOffer = async (offer) => {
      try {
        const connection = await ensureReceiverConnection();
        await connection.setRemoteDescription(new RTCSessionDescription(offer));

        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        socket.emit("webrtc_answer", answer);
      } catch (error) {
        console.error("Failed to handle WebRTC offer:", error);
        cleanupCall();
      }
    };

    const handleWebrtcAnswer = async (answer) => {
      try {
        if (!peerConnection.current) return;

        await peerConnection.current.setRemoteDescription(
          new RTCSessionDescription(answer),
        );
      } catch (error) {
        console.error("Failed to handle WebRTC answer:", error);
      }
    };

    const handleIceCandidate = async (candidate) => {
      try {
        if (!peerConnection.current || !candidate) return;

        await peerConnection.current.addIceCandidate(
          new RTCIceCandidate(candidate),
        );
      } catch (error) {
        console.error("Failed to add ICE candidate:", error);
      }
    };

    socket.on("trigger_popup", handleTriggerPopup);
    socket.on("start_video", handleStartVideo);
    socket.on("cancel_call", handleCancelCall);
    socket.on("webrtc_offer", handleWebrtcOffer);
    socket.on("webrtc_answer", handleWebrtcAnswer);
    socket.on("webrtc_ice_candidate", handleIceCandidate);

    return () => {
      socket.off("trigger_popup", handleTriggerPopup);
      socket.off("start_video", handleStartVideo);
      socket.off("cancel_call", handleCancelCall);
      socket.off("webrtc_offer", handleWebrtcOffer);
      socket.off("webrtc_answer", handleWebrtcAnswer);
      socket.off("webrtc_ice_candidate", handleIceCandidate);
      cleanupCall();
    };
  }, [cleanupCall, ensureReceiverConnection, initiateCall, socket]);

  const handleAccept = () => {
    setCallStatus(CALL_STATUS.WAITING);
    socket?.emit("accept_call", {
      scheduleId: popupData?.scheduleId,
    });
  };

  const handleDecline = () => {
    socket?.emit("decline_call", {
      scheduleId: popupData?.scheduleId,
    });
    cleanupCall();
  };

  return (
    <>
      {popupData && (
        <div className="video-call-overlay" role="dialog" aria-modal="true">
          <div className="video-call-popup">
            <p className="video-call-kicker">Reminder ringing</p>
            <h2>{popupData.title}</h2>
            <p className="video-call-copy">
              Both partners need to accept before the video call starts.
            </p>

            <div className="video-call-actions">
              <button type="button" onClick={handleAccept}>
                Accept
              </button>
              <button type="button" onClick={handleDecline}>
                Decline
              </button>
            </div>

            {callStatus === CALL_STATUS.WAITING && (
              <p className="video-call-waiting">Waiting for your partner...</p>
            )}
          </div>
        </div>
      )}

      {callStatus === CALL_STATUS.IN_CALL && (
        <section className="video-call-stage" aria-label="Video call">
          <video
            ref={remoteVideoRef}
            className="video-call-remote"
            autoPlay
            playsInline
          />
          <video
            ref={localVideoRef}
            className="video-call-local"
            autoPlay
            playsInline
            muted
          />
          <button type="button" onClick={cleanupCall}>
            End call
          </button>
        </section>
      )}
    </>
  );
}

export default VideoCall;
