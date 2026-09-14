# Tourism Context

## Purpose

Tourism is a standalone service for building travel experiences. The initial
version provides a small, dependency-free HTTP entry point so the product
surface can be expanded without committing to a framework before the domain
requirements are known.

## Initial Vocabulary

- **Destination**: A place a traveler may visit.
- **Trip**: A planned journey with one or more destinations.
- **Traveler**: A person using the service to plan or manage a trip.

## Boundaries

The initial scaffold does not persist traveler data, call external providers,
or expose authentication. Those concerns should be introduced only after the
corresponding product requirements are defined.
