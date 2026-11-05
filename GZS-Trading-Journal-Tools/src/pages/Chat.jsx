const messages = [
  { who: 'Mira', text: 'Need two more for Obsidian Keep tonight.' },
  { who: 'Dax', text: 'I can tank if Vale is late.' },
  { who: 'Lira', text: 'Tax collected. Treasury is updated.' },
  { who: 'Kael', text: 'Bring flasks. We push the second boss this week.' }
]

export default function Chat() {
  return (
    <div className="cb-card cb-chat">
      <div className="cb-chat-log">
        {messages.map((msg) => (
          <div className="cb-msg" key={msg.text}>
            <strong>{msg.who}</strong>
            <p>{msg.text}</p>
          </div>
        ))}
      </div>
      <form
        className="cb-chat-input"
        onSubmit={(event) => {
          event.preventDefault()
        }}
      >
        <input placeholder="Message the clan..." />
        <button className="cb-btn" type="submit">
          Send
        </button>
      </form>
    </div>
  )
}
