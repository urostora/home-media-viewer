import type { FileMeta } from '@prisma/client';

export type MetadataValue = Pick<
  FileMeta,
  'type' | 'intValue' | 'floatValue' | 'stringValue' | 'dateValue' | 'latitude' | 'longitude'
>;

// Extraction accumulates values without writing to the database. Publication belongs to the stage runner.
export class MetadataCollector {
  entries = new Map<string, MetadataValue>();
  contentDate: Date | null = null;

  private set(key: string, value: Partial<MetadataValue> & Pick<MetadataValue, 'type'>): void {
    this.entries.set(key, {
      intValue: null,
      floatValue: null,
      stringValue: null,
      dateValue: null,
      latitude: null,
      longitude: null,
      ...value,
    });
  }

  addInt(key: string, value: number): void {
    this.set(key, { type: 'Int', intValue: Math.round(value) });
  }
  addFloat(key: string, value: number): void {
    this.set(key, { type: 'Float', floatValue: value });
  }
  addString(key: string, value: string): void {
    this.set(key, { type: 'String', stringValue: value });
  }
  addDate(key: string, value: Date): void {
    this.set(key, { type: 'DateTime', dateValue: value });
  }
  addPosition(key: string, latitude: number, longitude: number): void {
    this.set(key, { type: 'Location', latitude, longitude });
  }
}

export type ExtractedMetadata = Pick<MetadataCollector, 'entries' | 'contentDate'>;
