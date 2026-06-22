/**
 * TypeDB Cloud Connector
 *
 * Erweiterte Version des TypeDB Connectors mit TypeDB Cloud Support
 * Unterstützt sowohl Cloud als auch Core (lokal)
 */

const { TypeDB } = require('typedb-client');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');

class TypeDBCloudConnector {
  constructor(config = {}) {
    // Cloud oder Core?
    this.isCloud = config.isCloud || process.env.TYPEDB_IS_CLOUD === 'true';

    if (this.isCloud) {
      // TypeDB Cloud Config
      this.address = config.address || process.env.TYPEDB_CLOUD_ADDRESS || 'cloud.typedb.com:1729';
      this.username = config.username || process.env.TYPEDB_USERNAME;
      this.password = config.password || process.env.TYPEDB_PASSWORD;

      if (!this.username || !this.password) {
        throw new Error('TypeDB Cloud requires username and password');
      }
    } else {
      // TypeDB Core Config
      this.address = config.host || process.env.TYPEDB_HOST || 'localhost:1729';
    }

    this.client = null;
    this.database = config.database || process.env.TYPEDB_DATABASE || 'meeting_knowledge';
  }

  /**
   * Initialisiert die Verbindung
   */
  async initialize() {
    try {
      if (this.isCloud) {
        console.log(`🔌 Connecting to TypeDB Cloud: ${this.address}`);

        const credentials = new TypeDB.TypeDBCredential(
          this.username,
          this.password
        );

        this.client = TypeDB.cloudClient(this.address, credentials);
        console.log(`✅ TypeDB Cloud Client connected`);
      } else {
        console.log(`🔌 Connecting to TypeDB Core: ${this.address}`);
        this.client = TypeDB.coreClient(this.address);
        console.log(`✅ TypeDB Core Client connected`);
      }

      // Prüfe Datenbank
      const databases = await this.client.databases.all();
      const exists = databases.some(db => db.name === this.database);

      if (!exists) {
        console.log(`📦 Creating database '${this.database}'...`);
        await this.client.databases.create(this.database);
        await this.loadSchema();
      } else {
        console.log(`✅ Database '${this.database}' exists`);
      }

      return true;
    } catch (error) {
      console.error('❌ TypeDB initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Lädt Schema
   */
  async loadSchema() {
    const session = await this.client.session(this.database, 'schema');
    const transaction = await session.transaction('write');

    try {
      const schemaPath = path.join(__dirname, 'schemas', 'meeting-schema.tql');
      const schema = await fs.readFile(schemaPath, 'utf-8');

      console.log('📋 Loading schema...');
      await transaction.query.define(schema);
      await transaction.commit();
      console.log('✅ Schema loaded successfully');
    } catch (error) {
      console.error('❌ Schema loading failed:', error);
      throw error;
    } finally {
      await transaction.close();
      await session.close();
    }
  }

  // Alle anderen Methoden identisch zum Original TypeDBConnector
  // (createMeeting, getMeetingDetails, etc.)

  /**
   * Erstellt Meeting
   */
  async createMeeting(meetingData) {
    const session = await this.client.session(this.database, 'data');
    const transaction = await session.transaction('write');

    try {
      const meetingId = uuidv4();
      const now = new Date().toISOString();

      let query = `
        insert
        $m isa meeting,
          has meeting-id "${meetingId}",
          has meeting-date ${meetingData.date}T00:00:00,
          has meeting-time "${meetingData.time}",
          has meeting-location "${this.escapeString(meetingData.location)}",
          has meeting-type "${meetingData.meeting_type}",
          has status "scheduled",
          has created-at ${now},
          has created-by "${meetingData.created_by || 'system'}";
      `;

      await transaction.query.insert(query);

      // Teilnehmer
      if (meetingData.participants && meetingData.participants.length > 0) {
        for (const participantId of meetingData.participants) {
          const participationQuery = `
            match
              $m isa meeting, has meeting-id "${meetingId}";
              $p isa person, has person-id "${participantId}";
            insert
              (meeting: $m, participant: $p) isa meeting-participation,
                has attendance-status "pending",
                has invited-at ${now};
          `;
          await transaction.query.insert(participationQuery);
        }
      }

      // Agenda Items
      if (meetingData.topics && meetingData.topics.length > 0) {
        for (let i = 0; i < meetingData.topics.length; i++) {
          const topic = meetingData.topics[i];
          const itemId = uuidv4();

          const agendaQuery = `
            match
              $m isa meeting, has meeting-id "${meetingId}";
            insert
              $ai isa agenda-item,
                has item-id "${itemId}",
                has topic "${this.escapeString(topic.topic || topic)}",
                has description "${this.escapeString(topic.description || '')}",
                has order-index ${i},
                has priority ${topic.priority || 5},
                has status "open";
              (meeting: $m, item: $ai) isa meeting-agenda;
          `;
          await transaction.query.insert(agendaQuery);
        }
      }

      await transaction.commit();
      console.log(`✅ Meeting created: ${meetingId}`);

      return { meetingId, success: true };
    } catch (error) {
      console.error('❌ Meeting creation failed:', error);
      return { success: false, error: error.message };
    } finally {
      await transaction.close();
      await session.close();
    }
  }

  /**
   * Ruft Meeting ab
   */
  async getMeetingDetails(meetingId) {
    const session = await this.client.session(this.database, 'data');
    const transaction = await session.transaction('read');

    try {
      const meetingQuery = `
        match
        $m isa meeting, has meeting-id "${meetingId}",
          has meeting-date $date,
          has meeting-time $time,
          has meeting-location $loc,
          has meeting-type $type,
          has status $status;
      `;

      const meetingIterator = await transaction.query.match(meetingQuery);
      const meetingResults = await meetingIterator.collect();

      if (meetingResults.length === 0) {
        return null;
      }

      const meetingConcept = meetingResults[0];
      const meeting = {
        id: meetingId,
        date: meetingConcept.get('date').value,
        time: meetingConcept.get('time').value,
        location: meetingConcept.get('loc').value,
        type: meetingConcept.get('type').value,
        status: meetingConcept.get('status').value,
        participants: [],
        agenda: []
      };

      // Teilnehmer
      const participantsQuery = `
        match
        $m isa meeting, has meeting-id "${meetingId}";
        $mp(meeting: $m, participant: $p) isa meeting-participation,
          has attendance-status $astatus;
        $p has person-id $pid, has name $name, has email $email;
      `;

      const participantsIterator = await transaction.query.match(participantsQuery);
      const participantsResults = await participantsIterator.collect();

      for (const concept of participantsResults) {
        meeting.participants.push({
          id: concept.get('pid').value,
          name: concept.get('name').value,
          email: concept.get('email').value,
          status: concept.get('astatus').value
        });
      }

      // Agenda
      const agendaQuery = `
        match
        $m isa meeting, has meeting-id "${meetingId}";
        $ma(meeting: $m, item: $ai) isa meeting-agenda;
        $ai has item-id $iid,
           has topic $topic,
           has description $desc,
           has order-index $order,
           has priority $prio;
      `;

      const agendaIterator = await transaction.query.match(agendaQuery);
      const agendaResults = await agendaIterator.collect();

      for (const concept of agendaResults) {
        meeting.agenda.push({
          id: concept.get('iid').value,
          topic: concept.get('topic').value,
          description: concept.get('desc').value,
          order: concept.get('order').value,
          priority: concept.get('prio').value
        });
      }

      meeting.agenda.sort((a, b) => a.order - b.order);

      return meeting;
    } finally {
      await transaction.close();
      await session.close();
    }
  }

  /**
   * Sucht Meetings
   */
  async searchMeetings(criteria) {
    const session = await this.client.session(this.database, 'data');
    const transaction = await session.transaction('read');

    try {
      let whereClause = '';

      if (criteria.meeting_type) {
        whereClause += `$m has meeting-type "${criteria.meeting_type}"; `;
      }

      if (criteria.status) {
        whereClause += `$m has status "${criteria.status}"; `;
      }

      if (criteria.date_from) {
        whereClause += `$m has meeting-date $date; $date >= ${criteria.date_from}T00:00:00; `;
      }

      if (criteria.date_to) {
        whereClause += `$m has meeting-date $date; $date <= ${criteria.date_to}T23:59:59; `;
      }

      const query = `
        match
        $m isa meeting,
          has meeting-id $mid,
          has meeting-date $date,
          has meeting-time $time,
          has meeting-location $loc,
          has meeting-type $type,
          has status $status;
        ${whereClause}
      `;

      const iterator = await transaction.query.match(query);
      const results = await iterator.collect();

      const meetings = results.map(concept => ({
        id: concept.get('mid').value,
        date: concept.get('date').value,
        time: concept.get('time').value,
        location: concept.get('loc').value,
        type: concept.get('type').value,
        status: concept.get('status').value
      }));

      return meetings;
    } finally {
      await transaction.close();
      await session.close();
    }
  }

  /**
   * Person hinzufügen/updaten
   */
  async upsertPerson(personData) {
    const session = await this.client.session(this.database, 'data');
    const transaction = await session.transaction('write');

    try {
      const personId = personData.person_id || uuidv4();

      const insertQuery = `
        insert
        $p isa person,
          has person-id "${personId}",
          has name "${this.escapeString(personData.name)}",
          has email "${personData.email}",
          has phone "${personData.phone || ''}",
          has role "${personData.role || 'participant'}",
          has department "${personData.department || ''}";
      `;

      await transaction.query.insert(insertQuery);
      await transaction.commit();

      return { personId, success: true };
    } catch (error) {
      console.error('Person upsert failed:', error);
      return { success: false, error: error.message };
    } finally {
      await transaction.close();
      await session.close();
    }
  }

  /**
   * Alle Personen
   */
  async getAllPersons() {
    const session = await this.client.session(this.database, 'data');
    const transaction = await session.transaction('read');

    try {
      const query = `
        match
        $p isa person,
          has person-id $pid,
          has name $name,
          has email $email,
          has role $role;
      `;

      const iterator = await transaction.query.match(query);
      const results = await iterator.collect();

      return results.map(concept => ({
        id: concept.get('pid').value,
        name: concept.get('name').value,
        email: concept.get('email').value,
        role: concept.get('role').value
      }));
    } finally {
      await transaction.close();
      await session.close();
    }
  }

  /**
   * Intent-Analyse speichern
   */
  async storeIntentAnalysis(prompt, analysis, userId = 'anonymous') {
    const session = await this.client.session(this.database, 'data');
    const transaction = await session.transaction('write');

    try {
      const analysisId = uuidv4();

      const query = `
        insert
        $analysis isa intent-analysis,
          has analysis-id "${analysisId}",
          has prompt "${this.escapeString(prompt)}",
          has detected-intent "${analysis.intent}",
          has confidence ${analysis.confidence},
          has entities-json "${this.escapeString(JSON.stringify(analysis.entities))}",
          has timestamp ${Date.now()},
          has user-id "${userId}";
      `;

      await transaction.query.insert(query);
      await transaction.commit();

      return { analysisId, success: true };
    } catch (error) {
      console.error('Intent analysis storage failed:', error);
      return { success: false, error: error.message };
    } finally {
      await transaction.close();
      await session.close();
    }
  }

  /**
   * Utility: Escape Strings
   */
  escapeString(str) {
    if (!str) return '';
    return str.replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }

  /**
   * Close connection
   */
  async close() {
    if (this.client) {
      await this.client.close();
      console.log('✅ TypeDB Client closed');
    }
  }

  /**
   * Health Check
   */
  async healthCheck() {
    try {
      if (!this.client) {
        return { status: 'disconnected' };
      }

      const databases = await this.client.databases.all();
      const dbExists = databases.some(db => db.name === this.database);

      return {
        status: 'connected',
        type: this.isCloud ? 'cloud' : 'core',
        address: this.address,
        database: this.database,
        databaseExists: dbExists
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }
}

module.exports = TypeDBCloudConnector;
