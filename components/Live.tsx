import { useBroadcastEvent, useEventListener, useMyPresence, useOthers } from "@/liveblocks.config";
import LiveCursors from "./cursor/LiveCursors";
import { useCallback, useEffect, useState } from "react";
import CursorChat from "./cursor/CursorChat";
import { CursorMode, CursorState, Reaction, ReactionEvent } from "@/types/type";
import ReactionSelector from "./reaction/ReactionButton";
import FlyingReaction from "./reaction/FlyingReaction";
import useInterval from "@/hooks/useInterval";

// Main component for the collaborative area of the application.
const Live = () => {
   // Retrive a list of other active users  in the session and the current user's presence information.
   // `useOthers` returns an array of presence states for other users.
   // `useMyPresence` returns the current user's presence state and a function to update it.
   const others = useOthers();
   const [{ cursor }, updateMyPresnece] = useMyPresence() as any;

   // State initialization for cursor and reactions.
   const [cursorState, setCursorState] = useState<CursorState>({
      mode: CursorMode.Hidden // The cursor is initially hidden.
   });

   // State to store reactions.
   const [reactions, setReactions] = useState<Reaction[]>([]);

   // Liveblock built-in hook for broadcast event to other users.
   const broadcast = useBroadcastEvent();

   // Hook to clear reactions older than 4 seconds every second.
   // This keeps the UI clean and focused on recent interactions.
   useInterval(() => {
      setReactions((reactions) => reactions.filter((reaction) => reaction.timestamp > Date.now() - 4000));
   }, 1000);

   // Hook to broadcast a reaction if the cursor is in 'Reaction' mode and pressed.
   // Reaction are sent at a frequent interval (as long as the condition are met).
   useInterval(() => {
      if (cursorState.mode === CursorMode.Reaction && cursorState.isPressed && cursor) {
         setReactions((reactions) =>
            reactions.concat([
               {
                  point: { x: cursor.x, y: cursor.y },
                  value: cursorState.reaction,
                  timestamp: Date.now()
               }
            ])
         );

         broadcast({
            x: cursor.x,
            y: cursor.y,
            value: cursorState.reaction
         });
      }
   }, 100);

   // Listener for reaction events from other users, updating the local state to display reactions.
   useEventListener((eventData) => {
      const event = eventData.event as ReactionEvent;

      setReactions((reactions) =>
         reactions.concat([
            {
               point: { x: event.x, y: event.y },
               value: event.value,
               timestamp: Date.now()
            }
         ])
      );
   });

   // Memoized callback for handling pointer movements. This updates the user's cursor position in real-time.
   // Prevents unnecessary re-creation of the function, improving performance.
   const handlePointerMove = useCallback((event: React.PointerEvent) => {
      event.preventDefault();

      if (cursor == null || cursorState.mode !== CursorMode.ReactionSelector) {
         // Calculate cursor's position relative to the event target, ensuring it's aligned correctly in the collaborative canvas.
         const x = event.clientX - event.currentTarget.getBoundingClientRect().x;
         const y = event.clientY - event.currentTarget.getBoundingClientRect().y;

         // Updates the user's cursor position in the shared state, making it visible to other users in real-time.
         updateMyPresnece({ cursor: { x, y } });
      }
   }, []);

   // memoized callback for when the pointer leaves the interactive area, hiding the user's cursor from others.
   const handlePointerLeave = useCallback((event: React.PointerEvent) => {
      // Set the local cursor state to hidden, making the cursor disappear from the user's view.
      setCursorState({ mode: CursorMode.Hidden });

      // Clears the user's cursor position in the shared state, effectively hiding it from other users.
      updateMyPresnece({ cursor: null, message: null });
   }, []);

   // Handler for pointer up events to manage cursor state and interactions.
   const handlePointerUp = useCallback(
      (event: React.PointerEvent) => {
         setCursorState((state: CursorState) =>
            cursorState.mode === CursorMode.Reaction ? { ...state, isPressed: true } : state
         );
      },
      [cursorState.mode, setCursorState]
   );

   // Memoized callback for when the user clicks or taps, potentially start a drawing or interaction.
   const handlePointerDown = useCallback(
      (event: React.PointerEvent) => {
         // Recalculates and updates cursor's position to ensure accuracy at the start of the interaction.
         const x = event.clientX - event.currentTarget.getBoundingClientRect().x;
         const y = event.clientY - event.currentTarget.getBoundingClientRect().y;

         // Updates the shared state with the new position, signaling the start of an interaction.
         updateMyPresnece({ cursor: { x, y } });

         setCursorState((state: CursorState) =>
            cursorState.mode === CursorMode.Reaction ? { ...state, isPressed: true } : state
         );
      },
      [cursorState.mode, setCursorState]
   );

   useEffect(() => {
      const onKeyUp = (event: KeyboardEvent) => {
         // Check if the "/" key was released. if so, it changes the cursor mode to Chat,
         // indicating that the user is ready to start typing a message.
         if (event.key === "/") {
            setCursorState({
               mode: CursorMode.Chat, // Switches cursor to chat mode to enable typing.
               previousMessage: null, // Clears any previous message state.
               message: "" // Resets the current message state to empty string.
            });
         } else if (event.key === "Escape") {
            // If the Escape key was released, it clears any mesage being typed and hides the cursor.
            updateMyPresnece({
               message: "" // Clears the message in the user's presence data.
            });
            setCursorState({ mode: CursorMode.Hidden }); // Sets the cursor state to hidden.
         } else if (event.key === "e") {
            setCursorState({
               mode: CursorMode.ReactionSelector
            });
         }
      };

      // This handler is to prevent the default action,
      // avoid triggering browser shortcuts or other bindings when the "/" key is pressed.
      const onKeyDown = (event: KeyboardEvent) => {
         if (event.key === "/") {
            event.preventDefault(); // Prevents the default actions for the "/" key.
         }
      };

      // Adds the event listeners to the `window` object for 'keyup' and 'keydown' events.
      window.addEventListener("keyup", onKeyUp);
      window.addEventListener("keydown", onKeyDown);

      // Cleanup function to remove the event listeners when the component unmounts or
      // when the dependencies of the useEffect hook change. This prevents memory leaks
      // and ensures that the event listeners do not persist beyond the lifecycle of the component.
      return () => {
         window.removeEventListener("keyup", onKeyUp);
         window.removeEventListener("keydown", onKeyDown);
      };
   }, [updateMyPresnece]); // Inlcudes `updateMyPresence` to re-bind event listeners if it changes.

    // useCallback hook for setting a reaction
   const setReaction = useCallback((reaction: string) => {
      setCursorState({
         mode: CursorMode.Reaction,
         reaction,
         isPressed: false
      });
   }, []);

   // Renders the UI of the collaborative space, including handlers for pointer events to track user interaction.
   return (
      <div
         onPointerMove={handlePointerMove} // Tracks cursor movement within the area.
         onPointerLeave={handlePointerLeave} // Handles the cursor leavcing the interactive area.
         onPointerDown={handlePointerDown} // Tracks the start of a click or tap interaction.
         onPointerUp={handlePointerUp}
         className="h-[100vh] w-full flex justify-center items-center text-center">
         <h1 className="text-5xl text-white">Liveblocks Figma Clone</h1>

         {reactions.map((reaction) => (
            <FlyingReaction
               key={reaction.timestamp.toString()}
               x={reaction.point.x}
               y={reaction.point.y}
               timestamp={reaction.timestamp}
               value={reaction.value}
            />
         ))}

         {/* Condiontionally renders the CursorChat component if there is cursor data available, allowing for chat interactions based on cursor activity. */}
         {cursor && (
            <CursorChat
               cursor={cursor}
               cursorState={cursorState}
               setCursorState={setCursorState}
               updateMyPresence={updateMyPresnece}
            />
         )}

         {cursorState.mode === CursorMode.ReactionSelector && <ReactionSelector setReaction={setReaction} />}

         {/* Renders cursors of other users in the session, providing a visual indication of other users presence and activity.*/}
         <LiveCursors others={others} />
      </div>
   );
};

export default Live;
