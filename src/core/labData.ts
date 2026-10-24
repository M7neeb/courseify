// Data for the network lab: a packet walk-through, a narrow fake terminal and a capture reader.
// Every sentence is an i18n key; frames, commands and output are technical text and stay as they are.

// ---------- Packet walk ----------

export interface WalkStep {
  id: string;
  /** The packet, shown after the guess: technical lines. */
  frame: string[];
}

export interface WalkScenario {
  id: string;
  steps: WalkStep[];
}

const C_MAC = 'aa:aa:aa:00:00:10';
const G_MAC = 'bb:bb:bb:00:00:01';

export const WALK_SCENARIOS: WalkScenario[] = [
  {
    id: 'web',
    steps: [
      { id: 'arpReq', frame: [`Ethernet  src ${C_MAC}  dst ff:ff:ff:ff:ff:ff`, 'ARP  request: who has 192.168.1.1? Tell 192.168.1.10'] },
      { id: 'arpRep', frame: [`Ethernet  src ${G_MAC}  dst ${C_MAC}`, `ARP  reply: 192.168.1.1 is at ${G_MAC}`] },
      { id: 'dnsQ', frame: ['IP  192.168.1.10 > 192.168.1.1', 'UDP  49152 > 53', 'DNS  query: A example.com ?'] },
      { id: 'dnsA', frame: ['IP  192.168.1.1 > 192.168.1.10', 'UDP  53 > 49152', 'DNS  answer: example.com A 93.184.216.34'] },
      { id: 'syn', frame: [`Ethernet  src ${C_MAC}  dst ${G_MAC}`, 'IP  192.168.1.10 > 93.184.216.34', 'TCP  50123 > 80  [SYN]  Seq=0'] },
      { id: 'synAck', frame: ['IP  93.184.216.34 > 192.168.1.10', 'TCP  80 > 50123  [SYN, ACK]  Seq=0  Ack=1'] },
      { id: 'ack', frame: ['IP  192.168.1.10 > 93.184.216.34', 'TCP  50123 > 80  [ACK]  Seq=1  Ack=1'] },
      { id: 'get', frame: ['TCP  50123 > 80  [PSH, ACK]', 'HTTP  GET / HTTP/1.1', 'HTTP  Host: example.com'] },
      { id: 'ok', frame: ['TCP  80 > 50123  [PSH, ACK]', 'HTTP  HTTP/1.1 200 OK', 'HTTP  Content-Type: text/html'] }
    ]
  },
  {
    id: 'ping',
    steps: [
      { id: 'arpReq', frame: [`Ethernet  src ${C_MAC}  dst ff:ff:ff:ff:ff:ff`, 'ARP  request: who has 192.168.1.20? Tell 192.168.1.10'] },
      { id: 'arpRep', frame: ['Ethernet  src cc:cc:cc:00:00:20  dst aa:aa:aa:00:00:10', 'ARP  reply: 192.168.1.20 is at cc:cc:cc:00:00:20'] },
      { id: 'echo', frame: ['IP  192.168.1.10 > 192.168.1.20', 'ICMP  echo request  id=1  seq=1'] },
      { id: 'reply', frame: ['IP  192.168.1.20 > 192.168.1.10', 'ICMP  echo reply  id=1  seq=1'] }
    ]
  }
];

export interface WalkChoice {
  /** i18n keys of the four answers, shuffled. */
  keys: string[];
  correct: number;
}

/** The right answer for a step plus three wrong ones from the same walk, in a random order. */
export function walkChoice(scenario: WalkScenario, index: number, rng: () => number = Math.random): WalkChoice {
  const label = (id: string) => `walk.${scenario.id}.${id}.label`;
  const right = label(scenario.steps[index].id);
  const others = [...new Set(scenario.steps.map((s) => label(s.id)))].filter((k) => k !== right);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const keys = [right, ...others.slice(0, 3)];
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  return { keys, correct: keys.indexOf(right) };
}

// ---------- Fake terminal ----------

export interface TermResult {
  out: string[];
  /** The task is solved by this command. */
  done?: boolean;
}

export interface TermTask {
  id: string;
  /** Prompt shown before the cursor, "C:\>" or "user@pc:~$". */
  prompt: string;
  /** Start of a Linux-style task: the current folder; network tasks leave it out. */
  exec(line: string): TermResult;
}

const WIN = 'C:\\>';

/** A table of the commands one network task knows: [pattern, output, solves the task]. */
function table(rows: [RegExp, string[], boolean][]): (line: string) => TermResult {
  return (line) => {
    const text = line.trim().replace(/\s+/g, ' ');
    if (!text) return { out: [] };
    for (const [re, out, done] of rows) if (re.test(text)) return { out, done };
    return { out: [`'${text.split(' ')[0]}': not available in this task. Use the hint.`] };
  };
}

export const NET_TERMINAL_TASKS: TermTask[] = [
  {
    id: 'ip',
    prompt: WIN,
    exec: table([
      [
        /^ipconfig( \/all)?$/i,
        [
          'Windows IP Configuration',
          '',
          'Ethernet adapter Ethernet:',
          '',
          '   IPv4 Address. . . . . . . . . . . : 192.168.1.10',
          '   Subnet Mask . . . . . . . . . . . : 255.255.255.0',
          '   Default Gateway . . . . . . . . . : 192.168.1.1'
        ],
        true
      ]
    ])
  },
  {
    id: 'ping',
    prompt: WIN,
    exec: table([
      [
        /^ping( -n \d+)? 192\.168\.1\.1$/i,
        [
          'Pinging 192.168.1.1 with 32 bytes of data:',
          'Reply from 192.168.1.1: bytes=32 time=1ms TTL=64',
          'Reply from 192.168.1.1: bytes=32 time=1ms TTL=64',
          'Reply from 192.168.1.1: bytes=32 time=2ms TTL=64',
          'Reply from 192.168.1.1: bytes=32 time=1ms TTL=64',
          '',
          'Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)'
        ],
        true
      ],
      [/^ping .+$/i, ['Pinging ... Request timed out.', 'Request timed out.', 'Packets: Sent = 4, Received = 0, Lost = 4 (100% loss)'], false]
    ])
  },
  {
    id: 'arp',
    prompt: WIN,
    exec: table([
      [
        /^arp -a$/i,
        [
          'Interface: 192.168.1.10 --- 0x4',
          '  Internet Address      Physical Address      Type',
          '  192.168.1.1           bb-bb-bb-00-00-01     dynamic',
          '  192.168.1.20          cc-cc-cc-00-00-20     dynamic',
          '  192.168.1.255         ff-ff-ff-ff-ff-ff     static'
        ],
        true
      ]
    ])
  },
  {
    id: 'dns',
    prompt: WIN,
    exec: table([
      [
        /^nslookup example\.com$/i,
        ['Server:  router.local', 'Address:  192.168.1.1', '', 'Name:    example.com', 'Address:  93.184.216.34'],
        true
      ]
    ])
  },
  {
    id: 'route',
    prompt: WIN,
    exec: table([
      [
        /^tracert example\.com$/i,
        [
          'Tracing route to example.com [93.184.216.34] over a maximum of 30 hops:',
          '  1    <1 ms    <1 ms    <1 ms  192.168.1.1',
          '  2     8 ms     8 ms     9 ms  10.20.0.1',
          '  3    14 ms    13 ms    14 ms  203.0.113.9',
          '  4    21 ms    20 ms    21 ms  93.184.216.34',
          '',
          'Trace complete.'
        ],
        true
      ]
    ])
  }
];

// ---------- Capture reader ----------

export interface CaptureFrame {
  no: number;
  time: string;
  src: string;
  dst: string;
  proto: string;
  info: string;
  /** The layers in the middle pane. */
  detail: string[];
}

const C_IP = '192.168.1.10';
const S_IP = '93.184.216.34';

export const CAPTURE_FRAMES: CaptureFrame[] = [
  { no: 1, time: '0.000000', src: C_MAC, dst: 'Broadcast', proto: 'ARP', info: 'Who has 192.168.1.1? Tell 192.168.1.10', detail: ['Ethernet II: dst ff:ff:ff:ff:ff:ff', 'Address Resolution Protocol (request)'] },
  { no: 2, time: '0.000412', src: G_MAC, dst: C_MAC, proto: 'ARP', info: `192.168.1.1 is at ${G_MAC}`, detail: [`Ethernet II: dst ${C_MAC}`, 'Address Resolution Protocol (reply)'] },
  { no: 3, time: '0.000890', src: C_IP, dst: '192.168.1.1', proto: 'DNS', info: 'Standard query 0x1a2b A example.com', detail: ['Internet Protocol: 192.168.1.10 > 192.168.1.1', 'User Datagram Protocol: 49152 > 53', 'Domain Name System (query)'] },
  { no: 4, time: '0.021340', src: '192.168.1.1', dst: C_IP, proto: 'DNS', info: 'Standard query response 0x1a2b A example.com A 93.184.216.34', detail: ['Internet Protocol: 192.168.1.1 > 192.168.1.10', 'User Datagram Protocol: 53 > 49152', 'Domain Name System (response): example.com A 93.184.216.34'] },
  { no: 5, time: '0.021900', src: C_IP, dst: S_IP, proto: 'TCP', info: '50123 > 80 [SYN] Seq=0 Win=64240 Len=0', detail: [`Ethernet II: dst ${G_MAC}`, 'Internet Protocol: 192.168.1.10 > 93.184.216.34', 'Transmission Control Protocol: 50123 > 80, Flags: SYN'] },
  { no: 6, time: '0.045010', src: S_IP, dst: C_IP, proto: 'TCP', info: '80 > 50123 [SYN, ACK] Seq=0 Ack=1 Win=65535 Len=0', detail: ['Internet Protocol: 93.184.216.34 > 192.168.1.10', 'Transmission Control Protocol: 80 > 50123, Flags: SYN, ACK'] },
  { no: 7, time: '0.045080', src: C_IP, dst: S_IP, proto: 'TCP', info: '50123 > 80 [ACK] Seq=1 Ack=1 Win=64240 Len=0', detail: ['Internet Protocol: 192.168.1.10 > 93.184.216.34', 'Transmission Control Protocol: 50123 > 80, Flags: ACK'] },
  { no: 8, time: '0.045300', src: C_IP, dst: S_IP, proto: 'HTTP', info: 'GET / HTTP/1.1', detail: ['Transmission Control Protocol: 50123 > 80, Flags: PSH, ACK', 'Hypertext Transfer Protocol: GET / HTTP/1.1', 'Host: example.com'] },
  { no: 9, time: '0.068900', src: S_IP, dst: C_IP, proto: 'TCP', info: '80 > 50123 [ACK] Seq=1 Ack=87 Win=65535 Len=0', detail: ['Transmission Control Protocol: 80 > 50123, Flags: ACK'] },
  { no: 10, time: '0.070200', src: S_IP, dst: C_IP, proto: 'HTTP', info: 'HTTP/1.1 200 OK (text/html)', detail: ['Transmission Control Protocol: 80 > 50123, Flags: PSH, ACK', 'Hypertext Transfer Protocol: HTTP/1.1 200 OK', 'Content-Type: text/html'] },
  { no: 11, time: '0.070350', src: C_IP, dst: S_IP, proto: 'TCP', info: '50123 > 80 [ACK] Seq=87 Ack=1257 Win=64240 Len=0', detail: ['Transmission Control Protocol: 50123 > 80, Flags: ACK'] },
  { no: 12, time: '0.071000', src: C_IP, dst: S_IP, proto: 'TCP', info: '50123 > 80 [FIN, ACK] Seq=87 Ack=1257 Win=64240 Len=0', detail: ['Transmission Control Protocol: 50123 > 80, Flags: FIN, ACK'] }
];

export type CaptureQuestion =
  | { id: string; kind: 'row'; answer: number }
  | { id: string; kind: 'choice'; options: string[]; answer: number };

export const CAPTURE_QUESTIONS: CaptureQuestion[] = [
  { id: 'arp', kind: 'row', answer: 1 },
  { id: 'dnsAnswer', kind: 'row', answer: 4 },
  { id: 'syn', kind: 'row', answer: 5 },
  { id: 'handshakeEnd', kind: 'row', answer: 7 },
  { id: 'httpGet', kind: 'row', answer: 8 },
  { id: 'page', kind: 'row', answer: 10 },
  { id: 'close', kind: 'row', answer: 12 },
  { id: 'port', kind: 'choice', options: ['80', '443', '53', '50123'], answer: 0 },
  { id: 'resolved', kind: 'choice', options: ['93.184.216.34', '192.168.1.1', '192.168.1.10', '10.20.0.1'], answer: 0 },
  { id: 'lookupProto', kind: 'choice', options: ['DNS', 'ARP', 'ICMP', 'HTTP'], answer: 0 },
  { id: 'clientPort', kind: 'choice', options: ['50123', '80', '53', '49152'], answer: 0 }
];
