import { useEffect, useState, useCallback, useRef } from "react";
import AceEditor from "react-ace";
import { Toaster, toast } from 'react-hot-toast';
import { useNavigate } from "react-router-dom";
import { generateColor } from "../../utils";
import './Room.css';
import { useSocket } from '../../components/SocketWrapper';

// Import necessary modes, themes, and extensions for Ace Editor
import "ace-builds/src-noconflict/mode-javascript";
import "ace-builds/src-noconflict/mode-typescript";
import "ace-builds/src-noconflict/mode-python";
import "ace-builds/src-noconflict/mode-java";
import "ace-builds/src-noconflict/mode-golang";
import "ace-builds/src-noconflict/mode-c_cpp";
import "ace-builds/src-noconflict/keybinding-emacs";
import "ace-builds/src-noconflict/keybinding-vim";
import "ace-builds/src-noconflict/theme-monokai";
import "ace-builds/src-noconflict/ext-language_tools";
import "ace-builds/src-noconflict/ext-searchbox";

export default function Room() {
    const { socket, isConnected, username, roomId } = useSocket();
    const navigate = useNavigate();
    const editorRef = useRef(null);

    // States
    const [fetchedUsers, setFetchedUsers] = useState([]);
    const [fetchedCode, setFetchedCode] = useState("");
    const [language, setLanguage] = useState("javascript");
    const [codeKeybinding, setCodeKeybinding] = useState(undefined);
    const [output, setOutput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [aiResponse, setAiResponse] = useState("");
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [typingUsers, setTypingUsers] = useState([]);
    const typingTimeoutRef = useRef(null);

    const languagesAvailable = ["javascript", "java", "c_cpp", "python", "typescript", "golang"];
    const codeKeybindingsAvailable = ["default", "emacs", "vim"];

    const onChange = useCallback((newValue) => {
        if (socket) {
            setFetchedCode(newValue);
            socket.emit("update code", { roomId, code: newValue });
        }
        if (socket && username) {
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            } else {
                socket.emit('typing-start', { roomId, username });
            }
            typingTimeoutRef.current = setTimeout(() => {
                socket.emit('typing-stop', { roomId, username });
                typingTimeoutRef.current = null;
            }, 1500);
        }
    }, [socket, roomId, username]);

    const handleLanguageChange = useCallback((e) => {
        if (socket) {
            const newLanguage = e.target.value;
            setLanguage(newLanguage);
            socket.emit("update language", { roomId, languageUsed: newLanguage });
        }
    }, [socket, roomId]);

    const handleCodeKeybindingChange = useCallback((e) => {
        const value = e.target.value;
        setCodeKeybinding(value === "default" ? undefined : value);
    }, []);

    const handleLeave = useCallback(() => {
        sessionStorage.removeItem('username');
        if (socket) {
            socket.emit("leave room", { roomId });
        }
        navigate('/', { replace: true, state: {} });
    }, [socket, roomId, navigate]);

    const copyToClipboard = useCallback(async () => {
        if (!roomId) return;
        try {
            await navigator.clipboard.writeText(roomId);
            toast.success('Room ID copied to clipboard');
        } catch (error) {
            toast.error('Failed to copy room ID');
        }
    }, [roomId]);

    const handleRunCode = async () => {
        setIsLoading(true);
        setOutput("Executing code...");
        try {
            const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
            const response = await fetch(`${apiUrl}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    language: language,
                    code: fetchedCode
                })
            });
            const result = await response.json();
            if (result.stdout) setOutput(result.stdout);
            else if (result.stderr) setOutput(result.stderr);
            else if (result.compile_output) setOutput(result.compile_output);
            else setOutput("Execution finished with no output.");
        } catch (error) {
            setOutput("An error occurred. Could not run the code.");
        } finally {
            setIsLoading(false);
        }
    };

    // 👇 THIS IS THE CORRECTED AI HANDLER FUNCTION
    const handleAiRequest = async (prompt) => {
        const editor = editorRef.current?.editor;
        if (!editor) return;

        const selectedCode = editor.getSelectedText();
        if (!selectedCode) {
            toast.error("Please select a block of code first.");
            return;
        }

        setIsAiLoading(true);
        setAiResponse(`AI is thinking about: "${prompt}"...`);

        try {
            const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
            const response = await fetch(`${apiUrl}/ask-ai`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: selectedCode,
                    prompt: prompt
                })
            });
            const result = await response.json();
            setAiResponse(result.response || "No response from AI.");
        } catch (error) {
            setAiResponse("An error occurred. Could not get a response from the AI.");
        } finally {
            setIsAiLoading(false);
        }
    };

    useEffect(() => {
        if (!socket) return;
        const handleUpdateClientList = ({ userslist }) => setFetchedUsers(userslist || []);
        const handleLanguageChange = ({ languageUsed }) => { if (languageUsed) setLanguage(languageUsed); };
        const handleCodeChange = ({ code }) => setFetchedCode(code || "");

        socket.on("updating client list", handleUpdateClientList);
        socket.on("on language change", handleLanguageChange);
        socket.on("on code change", handleCodeChange);

        return () => {
            socket.off("updating client list", handleUpdateClientList);
            socket.off("on language change", handleLanguageChange);
            socket.off("on code change", handleCodeChange);
        };
    }, [socket]);
    
    useEffect(() => {
        if (!socket) return;
        const handleUserTypingStart = ({ username }) => {
            setTypingUsers(prev => [...new Set([...prev, username])]);
        };
        const handleUserTypingStop = ({ username }) => {
            setTypingUsers(prev => prev.filter(u => u !== username));
        };
        socket.on('user-typing-start', handleUserTypingStart);
        socket.on('user-typing-stop', handleUserTypingStop);
        return () => {
            socket.off('user-typing-start', handleUserTypingStart);
            socket.off('user-typing-stop', handleUserTypingStop);
        };
    }, [socket]);

    useEffect(() => {
        if (!isConnected || !socket) {
            const timer = setTimeout(() => {
                if (!socket?.connected) {
                    toast.error("Connection lost. Returning to home page.");
                    navigate('/', {replace: true});
                }
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [isConnected, socket, navigate]);

    return (
        <div className="room">
            <div className="roomSidebar">
                <div className="roomSidebarHeader">
                    <h3>Room: {roomId ? roomId.substring(0, 8) : '...'}</h3>
                    <p>User: {username}</p>
                </div>
                
                <div className="roomSidebarContent">
                    <div className="languageFieldWrapper">
                        <label htmlFor="language" className="fieldLabel">LANGUAGE:</label>
                        <select 
                            className="languageField" 
                            id="language" 
                            value={language} 
                            onChange={handleLanguageChange}
                        >
                            {languagesAvailable.map(lang => (
                                <option key={lang} value={lang}>{lang.toUpperCase()}</option>
                            ))}
                        </select>
                    </div>
                    <div className="languageFieldWrapper">
                        <label htmlFor="codeKeybinding" className="fieldLabel">KEYBINDING:</label>
                        <select 
                            className="languageField" 
                            id="codeKeybinding" 
                            value={codeKeybinding || "default"} 
                            onChange={handleCodeKeybindingChange}
                        >
                            {codeKeybindingsAvailable.map(kb => (
                                <option key={kb} value={kb}>{kb.toUpperCase()}</option>
                            ))}
                        </select>
                    </div>
                    <div className="usersSection">
                        <p className="usersTitle">CONNECTED USERS ({fetchedUsers.length})</p>
                        <div className="roomSidebarUsers">
                            {fetchedUsers.map((user) => (
                                <div key={user} className="roomSidebarUsersEach">
                                    <div 
                                        className="roomSidebarUsersEachAvatar" 
                                        style={{ backgroundColor: generateColor(user) }}
                                    >
                                        {user.slice(0, 2).toUpperCase()}
                                    </div>
                                    <div className="roomSidebarUsersEachName">
                                        {user}
                                        {user === username && <span className="youLabel"> (You)</span>}
                                        {typingUsers.includes(user) && <span className="typing-indicator">typing...</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="roomSidebarActions">
                    <button className="roomSidebarCopyBtn" onClick={copyToClipboard}>
                        COPY ROOM ID
                    </button>
                    <button className="roomSidebarBtn" onClick={handleLeave}>
                        LEAVE ROOM
                    </button>
                    <button className="roomSidebarBtn runBtn" onClick={handleRunCode} disabled={isLoading}>
                        {isLoading ? 'Running...' : 'Run Code'}
                    </button>
                </div>
            </div>

            <div className="editorSection">
                <div className="editorControls">
                    <button className="aiBtn" onClick={() => handleAiRequest("Explain this code")} disabled={isAiLoading}>
                        Explain Code
                    </button>
                    <button className="aiBtn" onClick={() => handleAiRequest("Find potential bugs")} disabled={isAiLoading}>
                        Find Bugs
                    </button>
                </div>

                <AceEditor
                    ref={editorRef}
                    className="roomCodeEditor"
                    mode={language}
                    keyboardHandler={codeKeybinding}
                    theme="monokai"
                    name="collabEditor"
                    width="auto"
                    height="auto"
                    value={fetchedCode}
                    onChange={onChange}
                    fontSize={15}
                    enableLiveAutocompletion={true}
                    enableBasicAutocompletion={true}
                    editorProps={{ $blockScrolling: true }}
                    setOptions={{ showLineNumbers: true, showPrintMargin: false }}
                />
                
                <div className="outputContainer">
                    <div className="outputPanel">
                        <h4>Output:</h4>
                        <pre className="outputBox">{output}</pre>
                    </div>
                    <div className="aiPanel">
                        <h4>AI Assistant:</h4>
                        <pre className="outputBox">{aiResponse}</pre>
                    </div>
                </div>
            </div>
            
            <Toaster position="top-right" />
        </div>
    );
}