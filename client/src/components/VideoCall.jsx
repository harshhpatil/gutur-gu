import { useCallback, useEffect, useRef, useState } from "react";

const ICE_SERVERS = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const CALL_STATUS = {
  IDLE: "idle",
  WAITING: "waiting",
  IN_CALL: "in-call",
};

function VideoCall({ socket, userId }) {
  const [popupData, setPopupData] = useState(null);
  const [callStatus, setCallStatus] = useState(CALL_STATUS.IDLE);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnection = useRef(null);
  const localStreamRef = useRef(null);
  const callStartPromiseRef = useRef(null);
  const pendingIceCandidatesRef = useRef([]);

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

    callStartPromiseRef.current = null;
    pendingIceCandidatesRef.current = [];
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

  const startMediaAndConnection = useCallback(async () => {
    if (peerConnection.current && localStreamRef.current) {
      return peerConnection.current;
    }

    if (callStartPromiseRef.current) {
      return callStartPromiseRef.current;
    }

    callStartPromiseRef.current = (async () => {
      setPopupData(null);
      setCallStatus(CALL_STATUS.IN_CALL);

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera and microphone are not available in this browser.");
      }

      // Capacitor WebViews support the standard getUserMedia Promise API.
      const localStream =
        localStreamRef.current ||
        (await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        }));

      localStreamRef.current = localStream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }

      const connection = peerConnection.current || createPeerConnection();
      const senderTrackIds = new Set(
        connection
          .getSenders()
          .map((sender) => sender.track?.id)
          .filter(Boolean),
      );

      localStream.getTracks().forEach((track) => {
        if (!senderTrackIds.has(track.id)) {
          connection.addTrack(track, localStream);
        }
      });

      return connection;
    })().finally(() => {
      callStartPromiseRef.current = null;
    });

    return callStartPromiseRef.current;
  }, [createPeerConnection]);

  const flushPendingIceCandidates = useCallback(async () => {
    if (!peerConnection.current?.remoteDescription) return;

    const candidates = pendingIceCandidatesRef.current;
    pendingIceCandidatesRef.current = [];

    for (const candidate of candidates) {
      await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }, []);

  const initiateCall = useCallback(
    async (isCaller) => {
      try {
        const connection = await startMediaAndConnection();

        if (isCaller && !connection.localDescription) {
          const offer = await connection.createOffer();
          await connection.setLocalDescription(offer);
          socket?.emit("webrtc_offer", offer);
        }
      } catch (error) {
        console.error("Failed to initiate video call:", error);
        cleanupCall();
      }
    },
    [cleanupCall, socket, startMediaAndConnection],
  );

  const ensureReceiverConnection = useCallback(async () => {
    return startMediaAndConnection();
  }, [startMediaAndConnection]);

  useEffect(() => {
    if (!socket) return undefined;

    const handleTriggerPopup = (data) => {
      setPopupData({
        title: data.title,
        scheduleId: data.scheduleId,
      });
      setCallStatus(CALL_STATUS.IDLE);
    };

    const handleStartVideo = (data) => {
      initiateCall(data?.initiatorId === userId);
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
        await flushPendingIceCandidates();
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
        await flushPendingIceCandidates();
      } catch (error) {
        console.error("Failed to handle WebRTC answer:", error);
      }
    };

    const handleIceCandidate = async (candidate) => {
      try {
        if (!candidate) return;

        if (!peerConnection.current?.remoteDescription) {
          pendingIceCandidatesRef.current.push(candidate);
          return;
        }

        await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
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
  }, [
    cleanupCall,
    ensureReceiverConnection,
    flushPendingIceCandidates,
    initiateCall,
    socket,
    userId,
  ]);

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

  const handleEndCall = () => {
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
          <button type="button" onClick={handleEndCall}>
            End call
          </button>
        </section>
      )}
    </>
  );
}

export default VideoCall;
