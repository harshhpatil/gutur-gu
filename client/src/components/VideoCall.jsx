import { useCallback, useEffect, useRef, useState } from "react";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    ...(import.meta.env.VITE_TURN_URL
      ? [
          {
            urls: import.meta.env.VITE_TURN_URL,
            username: import.meta.env.VITE_TURN_USERNAME,
            credential: import.meta.env.VITE_TURN_CREDENTIAL,
          },
        ]
      : []),
  ],
};

const CALL_STATUS = {
  IDLE: "idle",
  WAITING: "waiting",
  IN_CALL: "in-call",
};

function VideoCall({ socket, userId }) {
  const [popupData, setPopupData] = useState(null);
  const [callStatus, setCallStatus] = useState(CALL_STATUS.IDLE);
  const [connectionState, setConnectionState] = useState("idle");
  const [showEndCallConfirm, setShowEndCallConfirm] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnection = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(new MediaStream());
  const callStartPromiseRef = useRef(null);
  const pendingIceCandidatesRef = useRef([]);

  const attachRemoteStream = useCallback(() => {
    if (!remoteVideoRef.current) return;

    remoteVideoRef.current.srcObject = remoteStreamRef.current;
    remoteVideoRef.current.play().catch(() => {});
  }, []);

  const cleanupCall = useCallback(() => {
    if (peerConnection.current) {
      peerConnection.current.ontrack = null;
      peerConnection.current.onicecandidate = null;
      peerConnection.current.onconnectionstatechange = null;
      peerConnection.current.oniceconnectionstatechange = null;
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

    remoteStreamRef.current = new MediaStream();
    callStartPromiseRef.current = null;
    pendingIceCandidatesRef.current = [];
    setPopupData(null);
    setCallStatus(CALL_STATUS.IDLE);
    setConnectionState("idle");
    setShowEndCallConfirm(false);
  }, []);

  const createPeerConnection = useCallback(() => {
    const connection = new RTCPeerConnection(ICE_SERVERS);

    connection.ontrack = (event) => {
      if (event.streams?.[0]) {
        remoteStreamRef.current = event.streams[0];
      } else if (event.track) {
        remoteStreamRef.current.addTrack(event.track);
      }

      attachRemoteStream();
    };

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        socket?.emit("webrtc_ice_candidate", event.candidate);
      }
    };

    connection.onconnectionstatechange = () => {
      setConnectionState(connection.connectionState || "unknown");

      if (connection.connectionState === "failed" || connection.connectionState === "closed") {
        cleanupCall();
      }
    };

    connection.oniceconnectionstatechange = () => {
      const iceState = connection.iceConnectionState;
      setConnectionState(iceState || connection.connectionState || "unknown");

      if (iceState === "failed") {
        cleanupCall();
      }
    };

    peerConnection.current = connection;
    return connection;
  }, [attachRemoteStream, cleanupCall, socket]);

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
        localVideoRef.current.play().catch(() => {});
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
      setConnectionState("idle");
      setShowEndCallConfirm(false);
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
    if (!showEndCallConfirm) {
      setShowEndCallConfirm(true);
      return;
    }

    socket?.emit("decline_call", {
      scheduleId: popupData?.scheduleId,
    });
    cleanupCall();
  };

  const cancelEndCall = () => {
    setShowEndCallConfirm(false);
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
          <div className="video-call-status" aria-live="polite">
            <span>Connection</span>
            <strong>{connectionState}</strong>
          </div>
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
          {showEndCallConfirm ? (
            <div className="video-call-confirm">
              <p>End this call?</p>
              <div className="video-call-confirm-actions">
                <button type="button" onClick={handleEndCall}>
                  End now
                </button>
                <button type="button" onClick={cancelEndCall}>
                  Keep call
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={handleEndCall}>
              End call
            </button>
          )}
        </section>
      )}
    </>
  );
}

export default VideoCall;
