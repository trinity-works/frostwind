# Music credits

Music by [Fablefly Music](https://fablefly-music.itch.io/). The repository's
MIT `LICENSE` covers code and documentation only. Each file here keeps its own
licence.

| File | Title | Source | Licence |
|---|---|---|---|
| `veil-of-dreams.mp3` | Veil of Dreams | <https://fablefly-music.itch.io/veil-of-dreams> | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `lily-paddling-down-the-stream.mp3` | Lily-Paddling Down the Stream | <https://fablefly-music.itch.io/lily-paddling-down-the-stream> | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

Changes: both files are re-encoded to 96 kb/s MP3.

## Optional file

`sunny-stroll.mp3` is Sun Meadow's piece,
[Sunny Stroll](https://fablefly-music.itch.io/sunny-stroll). It is a paid track,
royalty-free for use in a project, with no grant to redistribute the file. The
public distribution does not carry it. Buy the track and place the file here,
and the build picks it up.

`src/main.js` imports it with `?optional`. With no file, the build bundles
`null`, and the `without` field of `MUSIC_TRACKS` in `src/music.js` makes Sun
Meadow play Veil of Dreams.

Add a track to the public distribution only with a licence that allows
redistribution of the file, and record it in the table.
