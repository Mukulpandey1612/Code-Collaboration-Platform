import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { v4 as uuidv4, validate } from 'uuid';
import { Toaster, toast } from 'react-hot-toast';
import './JoinRoom.css';

export default function JoinRoom() {
    const navigate = useNavigate();
    const [roomId, setRoomId] = useState("");
    const [username, setUsername] = useState("");

    const handleCreateRoom = (e) => {
        e.preventDefault();
        //prevent creating a new room if a room ID is already entered
        if (roomId.trim()) {
        toast.error("You have entered a Room ID. Please click 'Join Room' instead.");
        return;
    }

        if (!username.trim() || username.trim().length < 2) {
            toast.error("Please enter a valid username (at least 2 characters) first.");
            return;
        }
        const newRoomId = uuidv4();
        sessionStorage.setItem('username', username.trim());
        toast.success("New room created!");
        navigate(`/room/${newRoomId}`, {
            state: { username: username.trim() },
        });
    };

    const handleJoinRoom = (e) => {
        e.preventDefault();
        if (!validate(roomId.trim())) {
            toast.error("Invalid Room ID format.");
            return;
        }
        if (!username.trim() || username.trim().length < 2) {
            toast.error("Please enter a valid username (at least 2 characters).");
            return;
        }
        sessionStorage.setItem('username', username.trim());
        navigate(`/room/${roomId.trim()}`, {
            state: { username: username.trim() },
        });
    };

    return (
        <div className="homePageWrapper">
            <header className="header">
                <h1>&lt;/&gt;CodeSync</h1>
                <p>Real-time Collaborative Coding Platform</p>
            </header>

            <section className="featuresGrid">
                <div className="featureCard">
                    <h3>Collaborate</h3>
                    <p>Edit code together in real-time with multiple users.</p>
                </div>
                <div className="featureCard">
                    <h3>Live Chat</h3>
                    <p>Communicate with your team while coding.</p>
                </div>
                <div className="featureCard">
                    <h3>Execute Code</h3>
                    <p>Run code in multiple languages instantly.</p>
                </div>
            </section>
            
            <section className="roomActions">
                <div className="usernameWrapper">
                    <input
                        id="usernameInput"
                        type="text"
                        className="inputBox"
                        placeholder=" Enter your name to join..."
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                    />
                </div>

                <div className="actionColumns">
                    <div className="actionBox">
                        <h2>Create New Room</h2>
                        <p>Start a new collaboration session and share the room key with your team.</p>
                        <button className="btn primaryBtn" onClick={handleCreateRoom}>
                            &lt;&gt; Create Room
                        </button>
                    </div>
                    
                    <form className="actionBox" onSubmit={handleJoinRoom}>
                        <h2>Join Existing Room</h2>
                        <p>Enter a room key to join an existing collaboration session.</p>
                        <input
                            type="text"
                            className="inputBox"
                            placeholder=" Enter room key..."
                            value={roomId}
                            onChange={(e) => setRoomId(e.target.value)}
                        />
                        <button type="submit" className="btn secondaryBtn">
                            Join Room
                        </button>
                    </form>
                </div>
            </section>

            <Toaster position="top-center" />
        </div>
    );
}