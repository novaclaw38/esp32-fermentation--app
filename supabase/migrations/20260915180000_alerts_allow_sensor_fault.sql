-- Let a device report that its sensor is broken
--
-- Until now the temp+gravity module treated a failed temperature read as
-- "nothing worth posting" and went straight back to sleep -- before connecting
-- to WiFi. The result is that a unit with a disconnected DS18B20 is
-- indistinguishable from a unit that is flat, out of range, or never flashed:
-- all three are simply silent. That is the worst possible failure mode for a
-- sealed device whose only other diagnostic channel is a serial cable.
--
-- The device now stays awake, connects, and posts a 'sensor_fault' alert. Such
-- an alert has no temperature by definition, so the column has to admit that
-- rather than forcing the firmware to invent a placeholder reading -- a
-- sentinel like -127 or 0 would show up on the chart as real data.
alter table alerts alter column temperature_c drop not null;

comment on column alerts.temperature_c is
  'The reading that triggered the alert. NULL for reasons like sensor_fault, where the device is reporting that it has no reading to give.';
