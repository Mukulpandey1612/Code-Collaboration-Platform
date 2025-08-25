import React, { useEffect, useState, useRef, createContext, useContext } from "react";
import { toast } from "react-hot-toast";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { io } from "socket.io-client";

// Create a React Context to provide the socket instance
const SocketContext = createContext(null);

// Create a custom hook for easy access to the context
export const useSocket = () => {
    return useContext(SocketContext);
};

export default function SocketWrapper({ children }) {
    const [isConnected, setIsConnected] = useState(false);
    const [hasJoinedRoom, setHasJoinedRoom] = useState(false);
    const socketRef = useRef(null);
    
    const location = useLocation();
    const navigate = useNavigate();
    const { roomId } = useParams();

    const username = location.state?.username || sessionStorage.getItem('username');

    // Initialize socket connection only once
    useEffect(() => {
        if (!socketRef.current) {
            const serverUrl = process.env.REACT_APP_API_URL || "http://localhost:5000";
            console.log('Connecting to:', serverUrl);
            
            socketRef.current = io(serverUrl, {
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionAttempts: 5,
            });

            socketRef.current.on('connect', () => {
                console.log('Connected to server:', socketRef.current.id);
                setIsConnected(true);
            });

            socketRef.current.on('disconnect', (reason) => {
                console.log('Disconnected from server:', reason);
                setIsConnected(false);
                setHasJoinedRoom(false);
                toast.error(`Disconnected: ${reason}`);
            });

            socketRef.current.on('connect_error', (error) => {
                console.error('Connection error:', error);
                setIsConnected(false);
                toast.error('Failed to connect to server');
            });

            socketRef.current.on('new member joined', ({ username }) => {
                toast.success(`${username} joined the room`);
            });

            socketRef.current.on('member left', ({ username }) => {
                toast(`${username} left the room`, { icon: '👋' });
            });
            
            socketRef.current.on('join error', ({ message }) => {
                toast.error(message);
                navigate('/', { replace: true });
            });
        }

        return () => {
            if (socketRef.current) {
                console.log('Cleaning up socket connection');
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, []);

    // Handle room joining logic
    useEffect(() => {
        if (roomId && !username) {
            navigate("/", { replace: true });
            toast.error("No username provided. Please join from the home page.");
            return;
        }

        if (isConnected && socketRef.current && roomId && username && !hasJoinedRoom) {
            console.log(`Attempting to join room: ${roomId} as ${username}`);
            
            socketRef.current.emit("when a user joins", { 
                roomId, 
                username
            });
            
            setHasJoinedRoom(true);
        }
    }, [isConnected, username, roomId, navigate, hasJoinedRoom]);
    
    const socketContextValue = {
        socket: socketRef.current,
        isConnected,
        hasJoinedRoom,
        roomId,
        username,
    };

    if (roomId && !isConnected) {
        return <div><h2>Connecting to server...</h2></div>;
    }

    if (roomId && !hasJoinedRoom) {
        return <div><h2>Joining room...</h2></div>;
    }

    return (
        <SocketContext.Provider value={socketContextValue}>
            {children}
        </SocketContext.Provider>
    );
}