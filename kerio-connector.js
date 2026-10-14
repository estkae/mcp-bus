/**
 * Kerio Connect Integration Module
 *
 * Provides email access via IMAP/SMTP for the Remote MCP Server
 */

const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { sicherheitsKopf } = require('./kerio-kopfzeilen');
const nodemailer = require('nodemailer');

// Kerio Configuration from Environment Variables
const KERIO_CONFIG = {
  host: process.env.KERIO_HOST || '',
  imapPort: parseInt(process.env.KERIO_IMAP_PORT) || 993,
  smtpPort: parseInt(process.env.KERIO_SMTP_PORT) || 465,
  username: process.env.KERIO_USERNAME || '',
  password: process.env.KERIO_PASSWORD || '',
  useSsl: process.env.KERIO_USE_SSL !== 'false'
};

/**
 * Check if Kerio is configured
 */
function isKerioConfigured() {
  return !!(KERIO_CONFIG.host && KERIO_CONFIG.username && KERIO_CONFIG.password);
}

/**
 * Get IMAP connection
 */
function getImapConnection() {
  if (!isKerioConfigured()) {
    throw new Error('Kerio Connect not configured. Set KERIO_HOST, KERIO_USERNAME, KERIO_PASSWORD');
  }

  console.log(`📧 Creating IMAP connection to ${KERIO_CONFIG.host}:${KERIO_CONFIG.imapPort}`);

  return new Imap({
    user: KERIO_CONFIG.username,
    password: KERIO_CONFIG.password,
    host: KERIO_CONFIG.host,
    port: KERIO_CONFIG.imapPort,
    tls: KERIO_CONFIG.useSsl,
    tlsOptions: {
      rejectUnauthorized: false,
      servername: KERIO_CONFIG.host
    },
    authTimeout: 30000,
    connTimeout: 30000,
    keepalive: false,
    debug: (msg) => console.log(`📧 IMAP Debug: ${msg}`)
  });
}

/**
 * List emails from mailbox
 */
async function listEmails(params) {
  const { folder = 'INBOX', limit = 20, unreadOnly = false } = params;

  // Debug: Log configuration (ohne Passwort)
  console.log(`📧 Kerio listEmails - Host: ${KERIO_CONFIG.host}, User: ${KERIO_CONFIG.username}, Port: ${KERIO_CONFIG.imapPort}`);

  if (!isKerioConfigured()) {
    throw new Error('Kerio Connect not configured. Missing KERIO_HOST, KERIO_USERNAME or KERIO_PASSWORD');
  }

  return new Promise((resolve, reject) => {
    let imap;
    try {
      imap = getImapConnection();
    } catch (err) {
      return reject(new Error(`Failed to create IMAP connection: ${err.message}`));
    }
    const emails = [];
    let pendingParsers = 0;
    let fetchEnded = false;

    function checkComplete() {
      if (fetchEnded && pendingParsers === 0) {
        console.log(`📧 All ${emails.length} emails parsed, resolving and closing connection`);
        clearTimeout(timeout);
        // Resolve immediately, don't wait for imap.end event
        resolve({
          emails: emails.reverse(),
          total: emails.length,
          folder: folder
        });
        try { imap.end(); } catch(e) {}
      }
    }

    imap.once('ready', () => {
      imap.openBox(folder, true, (err, box) => {
        if (err) {
          imap.end();
          return reject(err);
        }

        const searchCriteria = unreadOnly ? ['UNSEEN'] : ['ALL'];

        imap.search(searchCriteria, (err, results) => {
          if (err) {
            imap.end();
            return reject(err);
          }

          if (results.length === 0) {
            imap.end();
            return resolve({ emails: [], total: 0, folder });
          }

          const fetchResults = results.slice(-limit);
          console.log(`📧 Fetching ${fetchResults.length} emails from ${folder}`);

          const fetch = imap.fetch(fetchResults, {
            bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE)',
            struct: true
          });

          fetch.on('message', (msg, seqno) => {
            // WICHTIG: node-imap fetch() ist UID-basiert, das seqno-Argument ist
            // aber die Sequenznummer. Wer die als 'id' zurueckbekam und damit
            // read_email aufrief, traf eine andere oder gar keine Mail (frueher
            // ein Haenger). Deshalb: id = UID aus den Attributen.
            let email = { id: seqno, seqno };
            pendingParsers++;

            msg.once('attributes', (attrs) => {
              if (attrs?.uid) email.id = attrs.uid;
            });

            msg.on('body', (stream, info) => {
              simpleParser(stream, (err, parsed) => {
                if (!err) {
                  email.from = parsed.from?.text || '';
                  email.to = parsed.to?.text || '';
                  email.subject = parsed.subject || '';
                  email.date = parsed.date || '';
                }
                emails.push(email);
                pendingParsers--;
                checkComplete();
              });
            });
          });

          fetch.once('error', (err) => {
            console.error(`📧 Fetch error: ${err.message}`);
            imap.end();
            reject(err);
          });

          fetch.once('end', () => {
            console.log(`📧 Fetch completed, waiting for parsers...`);
            fetchEnded = true;
            checkComplete();
          });
        });
      });
    });

    imap.once('error', (err) => {
      console.error(`📧 Kerio IMAP Error: ${err.message}`);
      reject(new Error(`IMAP connection failed: ${err.message}`));
    });

    imap.once('end', () => {
      console.log(`📧 IMAP connection closed`);
      // Don't resolve here - already resolved in checkComplete
    });

    // Connection timeout
    const timeout = setTimeout(() => {
      console.error(`📧 Connection timeout after 30 seconds`);
      try { imap.end(); } catch (e) {}
      reject(new Error('IMAP connection timeout after 30 seconds'));
    }, 30000);

    imap.once('ready', () => clearTimeout(timeout));

    try {
      imap.connect();
    } catch (err) {
      clearTimeout(timeout);
      reject(new Error(`Failed to connect to IMAP: ${err.message}`));
    }
  });
}

/**
 * Read full email content
 */
async function readEmail(params) {
  const { emailId, folder = 'INBOX' } = params;
  // Ohne Timeout konnte diese Funktion ewig offen bleiben (IMAP-Verbindung leckt,
  // Aufrufer sieht nur den 504 des Gateways). Jetzt: hart begrenzt und aufgeraeumt.
  const timeoutMs = parseInt(params?.timeoutMs) || parseInt(process.env.KERIO_READ_TIMEOUT_MS) || 45000;

  return new Promise((resolve, reject) => {
    const imap = getImapConnection();
    let settled = false;
    let parsing = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { imap.end(); } catch (e) {}
      fn(arg);
    };
    const timer = setTimeout(() => {
      finish(reject, new Error(`readEmail timeout nach ${timeoutMs}ms (emailId=${emailId}, folder=${folder})`));
    }, timeoutMs);

    imap.once('ready', () => {
      imap.openBox(folder, true, (err, box) => {
        if (err) {
          return finish(reject, err);
        }

        const fetch = imap.fetch([emailId], {
          bodies: '',
          struct: true
        });

        fetch.on('message', (msg, seqno) => {
          msg.on('body', (stream, info) => {
            parsing = true;
            simpleParser(stream, (err, parsed) => {
              if (err) {
                return finish(reject, err);
              }

              finish(resolve, {
                messageId: parsed.messageId || '',
                from: parsed.from?.text || '',
                to: parsed.to?.text || '',
                cc: parsed.cc?.text || '',
                subject: parsed.subject || '',
                date: parsed.date || '',
                text: parsed.text || '',
                html: parsed.html || '',
                attachments: parsed.attachments?.map((a, i) => ({
                  index: i,
                  filename: a.filename,
                  contentType: a.contentType,
                  size: a.size
                })) || [],
                headers: sicherheitsKopf(parsed.headerLines)
              });
            });
          });
        });

        fetch.once('error', (err) => {
          finish(reject, err);
        });

        // Kam gar kein Body (falsche emailId, leeres Fetch-Ergebnis), haengt der
        // Aufruf sonst bis zum Timeout -> hier sofort mit klarer Meldung raus.
        fetch.once('end', () => {
          if (!parsing) {
            finish(reject, new Error(`Keine Mail mit emailId=${emailId} in ${folder} gefunden`));
          }
        });
      });
    });

    imap.once('error', (err) => {
      finish(reject, err);
    });

    imap.connect();
  });
}

/**
 * Fetch ONE attachment INCLUDING its content (base64).
 *
 * kerio_read_email liefert bewusst nur Anhang-Metadaten. Der Inhalt wird hier
 * separat geholt, weil ihn u.a. der SLS-Security-Leadserver zum Virenscan
 * (ClamAV) braucht. Zwei Schutzvorkehrungen, weil das echte Postfachdaten sind:
 *   - Groessenlimit (maxBytes, Default KERIO_MAX_ATTACHMENT_BYTES bzw. 8 MB):
 *     zu grosse Anhaenge kommen als Metadaten OHNE Inhalt zurueck.
 *   - Token-Gate im Server-Routing (x-mcp-bus-token), damit der Inhalt nicht
 *     ueber den offenen /execute-Endpoint abfliesst.
 * Auswahl per filename (bevorzugt) oder index.
 */
const DEFAULT_MAX_ATTACHMENT_BYTES = parseInt(process.env.KERIO_MAX_ATTACHMENT_BYTES) || 8 * 1024 * 1024;

async function fetchAttachment(params) {
  const { emailId, folder = 'INBOX', filename = null, index = 0 } = params || {};
  const maxBytes = Math.min(
    parseInt(params?.maxBytes) || DEFAULT_MAX_ATTACHMENT_BYTES,
    DEFAULT_MAX_ATTACHMENT_BYTES
  );

  if (!isKerioConfigured()) {
    throw new Error('Kerio Connect not configured');
  }
  if (emailId === undefined || emailId === null) {
    throw new Error('emailId is required');
  }

  return new Promise((resolve, reject) => {
    const imap = getImapConnection();
    let settled = false;
    const done = (fn, arg) => { if (!settled) { settled = true; fn(arg); } };

    const timeout = setTimeout(() => {
      try { imap.end(); } catch (e) {}
      done(reject, new Error('IMAP connection timeout after 30 seconds'));
    }, 30000);

    imap.once('ready', () => {
      imap.openBox(folder, true, (err) => {
        if (err) {
          clearTimeout(timeout);
          imap.end();
          return done(reject, err);
        }

        const fetch = imap.fetch([emailId], { bodies: '', struct: true });

        fetch.on('message', (msg) => {
          msg.on('body', (stream) => {
            simpleParser(stream, (err, parsed) => {
              clearTimeout(timeout);
              imap.end();

              if (err) {
                return done(reject, err);
              }

              const list = parsed.attachments || [];
              const att = filename
                ? list.find(a => a.filename === filename)
                : list[index];

              if (!att) {
                return done(reject, new Error(
                  `Attachment not found (filename=${filename}, index=${index}, available=${list.length})`
                ));
              }

              const size = att.size ?? att.content?.length ?? 0;
              if (size > maxBytes) {
                return done(resolve, {
                  filename: att.filename,
                  contentType: att.contentType,
                  size,
                  skipped: true,
                  reason: `Attachment groesser als Limit (${size} > ${maxBytes} Bytes)`
                });
              }

              done(resolve, {
                filename: att.filename,
                contentType: att.contentType,
                size,
                skipped: false,
                contentBase64: Buffer.from(att.content).toString('base64')
              });
            });
          });
        });

        fetch.once('error', (err) => {
          clearTimeout(timeout);
          imap.end();
          done(reject, err);
        });
      });
    });

    imap.once('error', (err) => {
      clearTimeout(timeout);
      done(reject, err);
    });

    imap.connect();
  });
}

/**
 * Send email via SMTP and save to Sent folder
 */
async function sendEmail(params) {
  if (!isKerioConfigured()) {
    throw new Error('Kerio Connect not configured');
  }

  const { to, subject, text, html, cc, bcc, saveCopyToSent = true, sentFolder = 'Sent' } = params;

  const transporter = nodemailer.createTransport({
    host: KERIO_CONFIG.host,
    port: KERIO_CONFIG.smtpPort,
    secure: true,
    auth: {
      user: KERIO_CONFIG.username,
      pass: KERIO_CONFIG.password
    }
  });

  // Aktuelles Datum im korrekten RFC 2822 Format
  const now = new Date();

  const mailOptions = {
    from: KERIO_CONFIG.username,
    to,
    subject,
    text,
    html,
    cc,
    bcc,
    date: now  // Explizites Sendedatum setzen
  };

  try {
    // 1. Email über SMTP versenden
    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent via SMTP, MessageID: ${info.messageId}`);

    // 2. Kopie im "Gesendet"-Ordner speichern (wenn gewünscht)
    if (saveCopyToSent) {
      try {
        await saveToSentFolder(mailOptions, sentFolder);
        console.log(`📧 Email copy saved to ${sentFolder} folder`);
      } catch (sentError) {
        console.error(`⚠️  Failed to save to sent folder: ${sentError.message}`);
        // Fehler loggen, aber nicht werfen - Mail wurde ja versendet
      }
    }

    return {
      success: true,
      messageId: info.messageId,
      message: `Email sent successfully to ${to}`,
      savedToSent: saveCopyToSent
    };
  } catch (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

/**
 * Send email with attachments via SMTP
 * Attachments should be array of: { filename, content (base64), contentType, encoding }
 */
async function sendEmailWithAttachment(params) {
  if (!isKerioConfigured()) {
    throw new Error('Kerio Connect not configured');
  }

  const {
    to,
    subject,
    text,
    html,
    cc,
    bcc,
    attachments = [],
    saveCopyToSent = true,
    sentFolder = 'Sent'
  } = params;

  const transporter = nodemailer.createTransport({
    host: KERIO_CONFIG.host,
    port: KERIO_CONFIG.smtpPort,
    secure: true,
    auth: {
      user: KERIO_CONFIG.username,
      pass: KERIO_CONFIG.password
    }
  });

  const now = new Date();

  // Konvertiere Attachments für nodemailer
  const nodemailerAttachments = attachments.map(att => ({
    filename: att.filename,
    content: Buffer.from(att.content, att.encoding || 'base64'),
    contentType: att.contentType || 'application/octet-stream'
  }));

  const mailOptions = {
    from: KERIO_CONFIG.username,
    to,
    subject,
    text,
    html,
    cc,
    bcc,
    date: now,
    attachments: nodemailerAttachments
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Email with ${attachments.length} attachment(s) sent via SMTP, MessageID: ${info.messageId}`);

    if (saveCopyToSent) {
      try {
        await saveToSentFolder(mailOptions, sentFolder);
        console.log(`📧 Email copy saved to ${sentFolder} folder`);
      } catch (sentError) {
        console.error(`⚠️  Failed to save to sent folder: ${sentError.message}`);
      }
    }

    return {
      success: true,
      messageId: info.messageId,
      message: `Email with ${attachments.length} attachment(s) sent successfully to ${to}`,
      attachmentCount: attachments.length,
      savedToSent: saveCopyToSent
    };
  } catch (error) {
    throw new Error(`Failed to send email with attachment: ${error.message}`);
  }
}

/**
 * Save email copy to Sent folder via IMAP
 */
async function saveToSentFolder(mailOptions, sentFolder) {
  return new Promise((resolve, reject) => {
    const imap = getImapConnection();

    // Erstelle RFC 2822 Mail-Nachricht
    const mailMessage = buildRFC2822Message(mailOptions);

    imap.once('ready', () => {
      // Öffne Sent-Ordner im Schreibmodus
      imap.openBox(sentFolder, false, (err, box) => {
        if (err) {
          // Versuche alternative Ordnernamen
          const alternativeFolders = ['Gesendet', 'Sent Items', 'Sent Mail'];
          tryAlternativeFolders(imap, alternativeFolders, mailMessage, resolve, reject);
          return;
        }

        // Füge Mail zum Sent-Ordner hinzu
        imap.append(mailMessage, { mailbox: sentFolder, flags: ['\\Seen'] }, (appendErr) => {
          imap.end();

          if (appendErr) {
            return reject(new Error(`Failed to append to ${sentFolder}: ${appendErr.message}`));
          }

          resolve();
        });
      });
    });

    imap.once('error', (err) => {
      reject(new Error(`IMAP error while saving to sent: ${err.message}`));
    });

    imap.connect();
  });
}

/**
 * Try alternative folder names if default fails
 */
function tryAlternativeFolders(imap, folders, mailMessage, resolve, reject) {
  if (folders.length === 0) {
    imap.end();
    return reject(new Error('Could not find Sent folder. Try: Sent, Gesendet, or Sent Items'));
  }

  const folder = folders.shift();

  imap.openBox(folder, false, (err, box) => {
    if (err) {
      // Versuche nächsten Ordner
      tryAlternativeFolders(imap, folders, mailMessage, resolve, reject);
      return;
    }

    console.log(`✅ Found sent folder: ${folder}`);

    imap.append(mailMessage, { mailbox: folder, flags: ['\\Seen'] }, (appendErr) => {
      imap.end();

      if (appendErr) {
        return reject(new Error(`Failed to append to ${folder}: ${appendErr.message}`));
      }

      resolve();
    });
  });
}

/**
 * Build RFC 2822 compliant email message
 */
function buildRFC2822Message(mailOptions) {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = mailOptions.date || new Date();

  // RFC 2822 Date Format
  const dateStr = now.toUTCString();

  let message = '';
  message += `From: ${mailOptions.from}\r\n`;
  message += `To: ${mailOptions.to}\r\n`;
  if (mailOptions.cc) message += `Cc: ${mailOptions.cc}\r\n`;
  message += `Subject: ${mailOptions.subject}\r\n`;
  message += `Date: ${dateStr}\r\n`;
  message += `MIME-Version: 1.0\r\n`;

  if (mailOptions.html) {
    message += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;

    // Plain text part
    if (mailOptions.text) {
      message += `--${boundary}\r\n`;
      message += `Content-Type: text/plain; charset="UTF-8"\r\n`;
      message += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
      message += `${mailOptions.text}\r\n\r\n`;
    }

    // HTML part
    message += `--${boundary}\r\n`;
    message += `Content-Type: text/html; charset="UTF-8"\r\n`;
    message += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
    message += `${mailOptions.html}\r\n\r\n`;
    message += `--${boundary}--\r\n`;
  } else {
    message += `Content-Type: text/plain; charset="UTF-8"\r\n`;
    message += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
    message += `${mailOptions.text || ''}\r\n`;
  }

  return message;
}

/**
 * List all available IMAP folders
 */
async function listFolders() {
  if (!isKerioConfigured()) {
    throw new Error('Kerio Connect not configured');
  }

  return new Promise((resolve, reject) => {
    const imap = getImapConnection();

    imap.once('ready', () => {
      imap.getBoxes((err, boxes) => {
        imap.end();

        if (err) {
          return reject(err);
        }

        // Flatten folder structure
        const folders = [];
        function extractFolders(boxesObj, prefix = '') {
          for (const [name, info] of Object.entries(boxesObj)) {
            const fullName = prefix ? `${prefix}${info.delimiter}${name}` : name;
            folders.push({
              name: fullName,
              delimiter: info.delimiter,
              hasChildren: info.children !== null
            });
            if (info.children) {
              extractFolders(info.children, fullName);
            }
          }
        }
        extractFolders(boxes);

        resolve({ folders });
      });
    });

    imap.once('error', (err) => {
      reject(err);
    });

    imap.connect();
  });
}

/**
 * Search emails by query
 */
async function searchEmails(params) {
  const { query, folder = 'INBOX', limit = 50 } = params;

  return new Promise((resolve, reject) => {
    const imap = getImapConnection();
    const emails = [];

    imap.once('ready', () => {
      imap.openBox(folder, true, (err, box) => {
        if (err) {
          imap.end();
          return reject(err);
        }

        const searchCriteria = [
          'OR',
          ['SUBJECT', query],
          ['BODY', query]
        ];

        imap.search(searchCriteria, (err, results) => {
          if (err) {
            imap.end();
            return reject(err);
          }

          if (results.length === 0) {
            imap.end();
            return resolve({ emails: [], total: 0, query, folder });
          }

          const fetchResults = results.slice(-limit);
          const fetch = imap.fetch(fetchResults, {
            bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE)',
            struct: true
          });

          fetch.on('message', (msg, seqno) => {
            // id = UID (siehe Kommentar in listEmails), nicht die Sequenznummer.
            let email = { id: seqno, seqno };

            msg.once('attributes', (attrs) => {
              if (attrs?.uid) email.id = attrs.uid;
            });

            msg.on('body', (stream, info) => {
              simpleParser(stream, (err, parsed) => {
                if (!err) {
                  email.from = parsed.from?.text || '';
                  email.to = parsed.to?.text || '';
                  email.subject = parsed.subject || '';
                  email.date = parsed.date || '';
                }
              });
            });

            msg.once('end', () => {
              emails.push(email);
            });
          });

          fetch.once('end', () => {
            imap.end();
          });
        });
      });
    });

    imap.once('error', (err) => {
      reject(err);
    });

    imap.once('end', () => {
      resolve({
        emails: emails.reverse(),
        total: emails.length,
        query: query,
        folder: folder
      });
    });

    imap.connect();
  });
}

// Kerio MCP Tools Definitions
const KERIO_TOOLS = [
  {
    name: "kerio_list_emails",
    description: "📧 Liste Emails aus Kerio Connect Postfach (INBOX oder andere Ordner)",
    input_schema: {
      type: "object",
      properties: {
        folder: {
          type: "string",
          description: "Mailbox folder (default: INBOX)",
          default: "INBOX"
        },
        limit: {
          type: "number",
          description: "Number of emails to retrieve (default: 20)",
          default: 20
        },
        unreadOnly: {
          type: "boolean",
          description: "Only show unread emails (default: false)",
          default: false
        }
      }
    }
  },
  {
    name: "kerio_read_email",
    description: "📖 Lese vollständigen Email-Inhalt (Text, HTML, Anhänge)",
    input_schema: {
      type: "object",
      properties: {
        emailId: {
          type: "number",
          description: "Email ID from list_emails"
        },
        folder: {
          type: "string",
          description: "Mailbox folder (default: INBOX)",
          default: "INBOX"
        }
      },
      required: ["emailId"]
    }
  },
  {
    name: "kerio_fetch_attachment",
    description: "📎 Hole EINEN Anhang inklusive Inhalt (base64) — z.B. für Virenscan. Token-geschützt, Größenlimit.",
    input_schema: {
      type: "object",
      properties: {
        emailId: {
          type: "number",
          description: "Email ID from list_emails"
        },
        folder: {
          type: "string",
          description: "Mailbox folder (default: INBOX)",
          default: "INBOX"
        },
        filename: {
          type: "string",
          description: "Dateiname des Anhangs (bevorzugt gegenüber index)"
        },
        index: {
          type: "number",
          description: "Index des Anhangs, falls kein filename angegeben (default: 0)",
          default: 0
        },
        maxBytes: {
          type: "number",
          description: "Obergrenze für den Inhalt; größere Anhänge kommen ohne Inhalt zurück (skipped: true)"
        }
      },
      required: ["emailId"]
    }
  },
  {
    name: "kerio_send_email",
    description: "✉️ Sende Email via Kerio Connect SMTP und speichere Kopie im Gesendet-Ordner",
    input_schema: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Recipient email address"
        },
        subject: {
          type: "string",
          description: "Email subject"
        },
        text: {
          type: "string",
          description: "Plain text body"
        },
        html: {
          type: "string",
          description: "HTML body (optional)"
        },
        cc: {
          type: "string",
          description: "CC recipients (optional)"
        },
        bcc: {
          type: "string",
          description: "BCC recipients (optional)"
        },
        saveCopyToSent: {
          type: "boolean",
          description: "Save copy to Sent folder (default: true)",
          default: true
        },
        sentFolder: {
          type: "string",
          description: "Name of sent folder (default: 'Sent', tries 'Gesendet', 'Sent Items' automatically)",
          default: "Sent"
        }
      },
      required: ["to", "subject"]
    }
  },
  {
    name: "kerio_search_emails",
    description: "🔍 Durchsuche Emails nach Suchbegriff (Subject oder Body)",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query"
        },
        folder: {
          type: "string",
          description: "Mailbox folder (default: INBOX)",
          default: "INBOX"
        },
        limit: {
          type: "number",
          description: "Max results (default: 50)",
          default: 50
        }
      },
      required: ["query"]
    }
  },
  {
    name: "kerio_list_folders",
    description: "📁 Liste alle verfügbaren IMAP-Ordner (INBOX, Sent, Gesendet, etc.)",
    input_schema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "kerio_send_email_with_attachment",
    description: "📎 Sende Email mit Anhängen (z.B. PDF, Bilder) via Kerio Connect SMTP",
    input_schema: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Recipient email address"
        },
        subject: {
          type: "string",
          description: "Email subject"
        },
        text: {
          type: "string",
          description: "Plain text body"
        },
        html: {
          type: "string",
          description: "HTML body (optional)"
        },
        cc: {
          type: "string",
          description: "CC recipients (optional)"
        },
        bcc: {
          type: "string",
          description: "BCC recipients (optional)"
        },
        attachments: {
          type: "array",
          description: "Array of attachments: [{filename, content (base64), contentType, encoding}]",
          items: {
            type: "object",
            properties: {
              filename: {
                type: "string",
                description: "Filename for the attachment"
              },
              content: {
                type: "string",
                description: "Base64-encoded file content"
              },
              contentType: {
                type: "string",
                description: "MIME type (e.g. application/pdf, image/png)"
              },
              encoding: {
                type: "string",
                description: "Encoding (default: base64)",
                default: "base64"
              }
            },
            required: ["filename", "content"]
          }
        },
        saveCopyToSent: {
          type: "boolean",
          description: "Save copy to Sent folder (default: true)",
          default: true
        }
      },
      required: ["to", "subject", "attachments"]
    }
  }
];

module.exports = {
  KERIO_CONFIG,
  KERIO_TOOLS,
  isKerioConfigured,
  listEmails,
  readEmail,
  fetchAttachment,
  sendEmail,
  sendEmailWithAttachment,
  searchEmails,
  listFolders
};
