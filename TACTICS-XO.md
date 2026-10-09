# Tactics XO

A competitive 4×4 mode alongside Classic and Bombs. The joining player (O) moves first.

- Connect four across a row, column or full diagonal to win immediately.
- Keep at most four marks. On your fifth placement, your oldest mark disappears **before** checking victory. The board labels that mark “NEXT OUT”.
- Each player has **one power for the whole match**. Spend it on a capture or a shield; you cannot use both.
- **Capture:** replace one unshielded opponent mark with your own. The captured mark leaves their age queue; your new mark joins yours.
- **Shield:** place a mark on an empty square and protect it from capture. It still disappears when it becomes your oldest fifth mark.
- Every placement, capture or shield uses one turn.
- At move 40, higher **pressure** wins. For each row, column and full diagonal without an opponent mark, two own marks score 1 and three own marks score 3. All other lines score 0. Equal scores draw.
- The final board, winner, loser, pressure result and power choices are saved in match history.

Save your power to break a winning threat, shield a crucial intersection, or force your opponent to lose a useful old mark. Pressure creates a deadline, so repeatedly blocking without building threats can lose the match.

## Supabase upgrade

Run `supabase/migrations/202610090004_tactics.sql` in the Supabase SQL Editor after the three existing migrations. It is safe to re-run and preserves existing matches. Without it, Classic and Bombs still work; Tactics creation shows a setup message.

The existing challenge push notifications also cover this mode. No new Firebase or Expo credentials are needed.

## Move sounds

The app uses the supplied `public/move-self.mp3` for the signed-in player's confirmed move and `public/capture.mp3` for the rival's confirmed move, in all modes. The current turn identifies the mover even when a bomb or expiry clears marks. Initial loading, match history and repeated snapshots do not play a sound. The sound toggle is remembered on the device.

These changes run in the hosted web app used by the Android wrapper. Once Vercel deploys, close and reopen the app to load them; this update does not change the native wrapper.
