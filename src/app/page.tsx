"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { GroundedAnswer } from "@/lib/types";
import EvidencePanel from "@/components/EvidencePanel";
import DataGapPanel from "@/components/DataGapPanel";
import DrawdownPanel from "@/components/DrawdownPanel";
import PlanetaryBoundariesPanel from "@/components/PlanetaryBoundariesPanel";
import PlanetaryBoundariesHUD from "@/components/PlanetaryBoundariesHUD";
import CountryImpactPanel from "@/components/CountryImpactPanel";
import CollabPlansPanel from "@/components/CollabPlansPanel";
import type { CollabPlan, PlanEntity } from "@/lib/plans";

interface LayerMeta {
  id: string;
  label: string;
  unit: string;
  display: string;
  higher_is_worse: boolean;
  source_name: string;
  source_url: string;
}
interface LayerVal {
  value: number;
  unit: string;
  year: string | null;
  severity: number;
}
interface IsoEntry {
  name: string;
  composite: number;
  count: number;
  layers: Record<string, LayerVal>;
}
interface CompositePayload {
  layers: LayerMeta[];
  worldTotals: Record<string, number>;
  byIso: Record<string, IsoEntry>;
}

function fmt(v: number, unit: string) {
  const n = v.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return unit === "%" ? `${n}%` : `${n} ${unit}`;
}

// Accurate heading for the highlights list, per layer (falls back to a
// direction-based generic for any layer not listed).
const HIGHLIGHT_HEADINGS: Record<string, string> = {
  cobalt_production: "Largest producers",
  cobalt_reserves: "Largest reserves",
  co2_per_capita: "Highest emitters",
  mineral_rents: "Most resource-dependent",
  forest_area: "Least forested",
  renewable_energy: "Lowest renewable share",
  electricity_access: "Lowest electricity access",
  water_access_basic: "Lowest water access",
  renew_water_pc: "Most water-scarce",
  poverty_headcount: "Most affected (poverty)",
  undernourishment: "Most affected (hunger)",
  wheat_production: "Largest producers",
  maize_production: "Largest producers",
  rice_production: "Largest producers",
  soybean_production: "Largest producers",
  coffee_production: "Largest producers",
  cocoa_production: "Largest producers",
  palm_oil_production: "Largest producers",
  sugarcane_production: "Largest producers",
  banana_production: "Largest producers",
  potato_production: "Largest producers",
  cassava_production: "Largest producers",
  meat_production: "Largest producers",
  milk_production: "Largest producers",
  lithium_production: "Largest producers",
  graphite_production: "Largest producers",
  copper_production: "Largest producers",
  nickel_production: "Largest producers",
  rare_earths_production: "Largest producers",
  tin_production: "Largest producers",
  tungsten_production: "Largest producers",
  tantalum_production: "Largest producers",
  manganese_production: "Largest producers",
  phosphate_production: "Largest producers",
  potash_production: "Largest producers",
  gold_production: "Largest producers",
  silver_production: "Largest producers",
  iron_ore_production: "Largest producers",
  zinc_production: "Largest producers",
  lead_production: "Largest producers",
  bauxite_production: "Largest producers",
  antimony_production: "Largest producers",
  molybdenum_production: "Largest producers",
  coal_production: "Largest producers",
  oil_production: "Largest producers",
  gas_production: "Largest producers",
  co2_total: "Highest emitters",
  methane_total: "Highest emitters",
  resource_rents_total: "Most resource-dependent",
  oil_rents: "Most oil-dependent",
  gas_rents: "Most gas-dependent",
  coal_rents: "Most coal-dependent",
  forest_rents: "Most forest-rent-dependent",
  clean_cooking: "Lowest clean-cooking access",
  gini: "Most unequal (Gini)",
  cereal_yield: "Lowest cereal yield",
  fertilizer_use: "Highest fertilizer intensity",
  water_stress: "Most water-stressed",
  land_degradation: "Most degraded land",
  exports_value: "Largest exporters",
  imports_value: "Largest importers",
  plastic_waste_pc: "Most plastic waste per person",
  plastic_to_ocean_share: "Largest share of ocean plastic",
  plastic_waste_total: "Most plastic waste generated",
  plastic_to_ocean_total: "Most plastic emitted to ocean",
  terrestrial_protected: "Most land protected",
  marine_protected: "Most ocean protected",
  threatened_birds: "Most threatened bird species",
  threatened_plants: "Most threatened plant species",
  fish_catch: "Largest fish & seafood catch",
  aquaculture: "Largest aquaculture producers",
  pm25_exposure: "Most polluted air (PM2.5)",
  basic_sanitation: "Lowest sanitation access",
  n2o_total: "Highest N₂O emitters",
  agri_land: "Most agricultural land",
  life_expectancy: "Lowest life expectancy",
  child_mortality: "Highest child mortality",
  gdp_per_capita: "Highest GDP per capita",
  maternal_mortality: "Highest maternal mortality",
  internet_access: "Lowest internet access",
  school_enrollment: "Lowest primary enrollment",
  access_to_finance: "Lowest financial access",
  arable_land: "Most arable land",
  energy_per_capita: "Highest energy use per person",
  obesity_adults: "Highest adult obesity",
  hdi: "Lowest human development",
  caloric_supply: "Lowest caloric supply",
  urban_population: "Most urbanized",
  health_expenditure: "Lowest health spending",
  tuberculosis: "Highest TB burden",
  physicians: "Fewest physicians",
  female_labor: "Lowest female labor participation",
  secondary_enrollment: "Lowest secondary enrollment",
  women_in_parliament: "Lowest representation of women",
  neonatal_mortality: "Highest neonatal mortality",
  hiv_incidence: "Highest HIV incidence",
  trade_openness: "Most trade-dependent economies",
  remittances: "Most remittance-dependent",
  education_expenditure: "Lowest education spending",
  manuf_value_added: "Most manufacturing-dependent",
  agri_value_added: "Most agriculture-dependent",
  electricity_per_capita: "Lowest electricity consumption per person",
  diabetes_prevalence: "Highest diabetes prevalence",
  inflation: "Highest inflation",
  air_pollution_deaths: "Highest air-pollution mortality",
  hospital_beds: "Fewest hospital beds",
  road_deaths: "Highest road traffic deaths",
  safe_sanitation: "Lowest safe sanitation access",
  food_insecurity_severe: "Highest severe food insecurity",
  poverty_gap: "Deepest poverty gap",
  threatened_mammals: "Most threatened mammal species",
  threatened_fish: "Most threatened fish species",
  unemployment: "Highest unemployment",
  adult_literacy: "Lowest adult literacy",
  mobile_subscriptions: "Lowest mobile connectivity",
  stunting: "Highest child stunting",
  suicide_rate: "Highest suicide mortality",
  control_of_corruption: "Weakest anti-corruption control",
  tobacco_deaths: "Highest tobacco mortality",
  alcohol_consumption: "Highest alcohol consumption",
  hydro_electricity: "Most hydro-dependent electricity",
  renewable_electricity_xhydro: "Most solar/wind electricity",
  tech_exports: "Highest tech export share",
  gross_savings: "Lowest gross savings rate",
  current_account: "Largest current account deficit",
  uhc_coverage: "Weakest health system coverage",
  food_production_index: "Lowest food production growth",
  out_of_pocket_health: "Highest out-of-pocket health burden",
  tax_revenue: "Lowest tax revenue",
  cardiovascular_deaths: "Highest cardiovascular mortality",
  coal_electricity: "Most coal-dependent electricity",
  gas_electricity: "Most gas-dependent electricity",
  oil_electricity: "Most oil-dependent electricity",
  fertility_rate: "Highest fertility rate",
  pop_over_65: "Most aging population",
  pop_under_14: "Youngest population",
  population_density: "Most densely populated",
  gni_per_capita_ppp: "Lowest income (PPP)",
  electricity_losses: "Highest grid losses",
  homicide_rate: "Highest homicide rate",
  alcohol_deaths: "Highest alcohol-disorder mortality",
  drug_deaths: "Highest drug-disorder mortality",
  employment_ratio: "Highest employment ratio",
  broadband: "Most fixed broadband access",
  military_expenditure: "Highest military spending (% GDP)",
  energy_intensity: "Least energy-efficient economy",
  business_days: "Hardest to start a business",
  rule_of_law: "Weakest rule of law",
  political_stability: "Least politically stable",
  gov_effectiveness: "Least effective government",
  ores_metals_exports: "Most mineral-export-dependent",
  fuel_exports: "Most fuel-export-dependent",
  cancer_deaths: "Highest cancer mortality",
  agricultural_employment: "Most agriculture-dependent labor",
  self_employment: "Highest self-employment rate",
  immunization_dtp: "Lowest DTP immunization coverage",
  co2_intensity_gdp: "Most carbon-intensive economy",
  fdi_inflows: "Highest FDI inflows (% GDP)",
  food_imports_share: "Most dependent on food imports",
  malaria_deaths: "Highest malaria mortality",
  diarrhea_deaths: "Highest diarrheal disease mortality",
  tertiary_enrollment: "Highest tertiary enrollment",
  rural_electricity: "Lowest rural electrification",
  domestic_credit: "Deepest private credit market",
  secure_servers: "Most secure internet servers",
};

// Per-layer question suggestions for the chat (varied — not just cobalt).
// Picked by the active layer; falls back to a rotating general set.
const LAYER_SUGGESTIONS: Record<string, string[]> = {
  plastic_waste_total: [
    "Where does the world's plastic waste come from, and where does it leak to the ocean?",
    "How do oil and gas production connect to plastics and petrochemical feedstocks?",
  ],
  cobalt_production: [
    "Who controls cobalt, who benefits, and what communities are affected?",
    "Where are the world's cobalt reserves concentrated?",
  ],
  cobalt_reserves: [
    "Where are the world's cobalt reserves concentrated?",
    "Who controls cobalt and who bears the mining costs?",
  ],
  co2_per_capita: [
    "Which countries emit the most CO₂ per person?",
    "Who emits the most yet bears the least climate cost?",
  ],
  mineral_rents: [
    "Which economies depend most on mineral extraction?",
    "Who profits from mineral rents and who is left behind?",
  ],
  forest_area: [
    "Where is forest cover lowest, and what's driving the loss?",
    "How does deforestation connect to commodity supply chains?",
  ],
  renewable_energy: [
    "Which countries rely least on renewable energy?",
    "Where is the energy transition lagging?",
  ],
  electricity_access: [
    "Where do the most people still lack electricity?",
    "How does energy poverty map onto mineral wealth?",
  ],
  water_access_basic: [
    "Where is basic drinking-water access lowest?",
    "Which communities bear the cost of water scarcity?",
  ],
  renew_water_pc: [
    "Which countries have the least freshwater per person?",
    "Where is water scarcity most acute?",
  ],
  water_stress: [
    "Which countries withdraw the most water relative to supply?",
    "Where is water stress threatening food and people?",
  ],
  land_degradation: [
    "Where is the most land degraded, and who depends on it?",
    "How does soil degradation connect to hunger and poverty?",
  ],
  poverty_headcount: [
    "Where is extreme poverty most concentrated?",
    "How does poverty overlap with resource extraction?",
  ],
  undernourishment: [
    "Where is hunger most widespread?",
    "How does undernourishment relate to land and water stress?",
  ],
  wheat_production: [
    "Which countries produce the most wheat?",
    "How concentrated is the world's staple-grain supply?",
  ],
  maize_production: [
    "Which countries produce the most maize?",
    "Who controls the global corn supply?",
  ],
  rice_production: [
    "Which countries produce the most rice?",
    "How exposed is rice supply to water stress?",
  ],
  soybean_production: [
    "Which countries produce the most soy?",
    "How does soy expansion connect to deforestation?",
  ],
  lithium_production: [
    "Who mines the world's lithium, and who profits from it?",
    "How concentrated is the battery-metal supply chain?",
  ],
  graphite_production: [
    "Which countries dominate graphite mining?",
    "How exposed are batteries to graphite supply?",
  ],
  copper_production: [
    "Who mines the world's copper, and who profits from it?",
    "How concentrated is copper — the metal of electrification?",
  ],
  rare_earths_production: [
    "Who controls rare-earth mining, and why does it matter?",
    "How dependent is the world on one rare-earths producer?",
  ],
  gold_production: [
    "Which countries produce the most gold?",
    "Who bears the environmental cost of gold mining?",
  ],
  nickel_production: [
    "Who mines the world's nickel, and who benefits?",
    "How does nickel demand connect to batteries and forests?",
  ],
  coffee_production: [
    "Who grows the world's coffee, and who captures the value?",
    "How does coffee link smallholders to global markets?",
  ],
  cocoa_production: [
    "Which countries grow the most cocoa, and who profits?",
    "How does cocoa connect farmers to the chocolate trade?",
  ],
  palm_oil_production: [
    "Where is palm oil produced, and what's the forest cost?",
    "How does palm oil expansion drive deforestation?",
  ],
  coal_production: [
    "Which countries produce the most coal?",
    "Who profits from coal, and who bears the climate cost?",
  ],
  oil_production: [
    "Which countries produce the most oil?",
    "How concentrated is global oil production?",
  ],
  gas_production: [
    "Which countries produce the most natural gas?",
    "Who controls global gas supply?",
  ],
  co2_total: [
    "Which countries emit the most CO₂ in total?",
    "Who emits the most, and who bears the climate cost?",
  ],
  methane_total: [
    "Which countries emit the most methane?",
    "Where could methane cuts matter most?",
  ],
  resource_rents_total: [
    "Which economies depend most on natural-resource rents?",
    "Who is most exposed to the resource curse?",
  ],
  gini: [
    "Where is income inequality highest?",
    "How does inequality overlap with resource wealth?",
  ],
  fertilizer_use: [
    "Where is fertilizer use most intensive?",
    "How does fertilizer intensity link mining to farming?",
  ],
  cereal_yield: [
    "Where are cereal yields lowest?",
    "How does low yield connect to hunger and land stress?",
  ],
  clean_cooking: [
    "Where do the most people lack clean cooking fuel?",
    "How does clean-cooking access map onto energy poverty?",
  ],
  exports_value: [
    "Which countries dominate global exports?",
    "How concentrated is world trade among a few economies?",
  ],
  imports_value: [
    "Which countries import the most by value?",
    "How does import dependence map onto resource flows?",
  ],
  fish_catch: [
    "Which countries catch the most fish, and who depends on it for food?",
    "How does fish catch connect to ocean health and food security?",
  ],
  aquaculture: [
    "Which countries produce the most farmed fish?",
    "How is aquaculture reshaping food systems and coastal ecosystems?",
  ],
  pm25_exposure: [
    "Where is air pollution worst, and who bears the health burden?",
    "How does PM2.5 exposure overlap with poverty and industry?",
  ],
  child_mortality: [
    "Where do children face the highest risk of death before age 5?",
    "How does child mortality map onto resource wealth and poverty?",
  ],
  life_expectancy: [
    "Where is life expectancy lowest, and what drives the gap?",
    "How does life expectancy differ between resource-rich and resource-poor countries?",
  ],
  basic_sanitation: [
    "Where do the most people still lack basic sanitation?",
    "How does sanitation access map onto water stress and poverty?",
  ],
  n2o_total: [
    "Which countries emit the most nitrous oxide?",
    "How do agriculture and industry drive N₂O emissions?",
  ],
  agri_land: [
    "Which countries have the most agricultural land?",
    "How does agricultural land use connect to deforestation and water stress?",
  ],
  gdp_per_capita: [
    "Which resource-rich countries have the lowest GDP per capita?",
    "Where is the gap between resource wealth and people's prosperity biggest?",
  ],
  maternal_mortality: [
    "Where is maternal mortality highest, and what drives the gap?",
    "How does maternal mortality overlap with resource extraction and poverty?",
  ],
  internet_access: [
    "Which countries have the least internet access?",
    "How does the digital divide map onto resource wealth and poverty?",
  ],
  school_enrollment: [
    "Where is primary school enrollment lowest?",
    "How does education access compare to resource extraction wealth?",
  ],
  access_to_finance: [
    "Where do people lack access to basic financial services?",
    "How does financial exclusion map onto resource wealth and poverty?",
  ],
  obesity_adults: [
    "Where is adult obesity highest, and what's driving it?",
    "How does the nutrition transition connect to trade and food systems?",
  ],
  energy_per_capita: [
    "Which countries use the most energy per person?",
    "How does per-capita energy use relate to emissions and development?",
  ],
  hdi: [
    "Which countries score lowest on the Human Development Index?",
    "How does human development compare to resource wealth in extractive economies?",
  ],
  caloric_supply: [
    "Where do people have the least food available per day?",
    "How does caloric supply overlap with hunger, drought, and commodity trade?",
  ],
  urban_population: [
    "Which countries are the least urbanized, and what does that mean for rural communities?",
    "How does urbanization connect to industrialization and resource extraction?",
  ],
  health_expenditure: [
    "Which countries spend the least on health as a share of GDP?",
    "How does health spending overlap with resource wealth and poverty outcomes?",
  ],
  tuberculosis: [
    "Where is tuberculosis burden highest, and who is most exposed?",
    "How does TB incidence overlap with poverty, crowding, and healthcare access?",
  ],
  physicians: [
    "Where are there the fewest doctors per person?",
    "How does healthcare capacity compare to disease burden across countries?",
  ],
  female_labor: [
    "Where is female labor force participation lowest?",
    "How does women's economic participation map onto resource wealth and inequality?",
  ],
  secondary_enrollment: [
    "Where is secondary school enrollment lowest?",
    "How does education access connect to poverty and child labor?",
  ],
  women_in_parliament: [
    "Where do women hold the fewest seats in national parliament?",
    "How does political representation for women connect to development outcomes?",
  ],
  neonatal_mortality: [
    "Where is newborn mortality highest, and what drives the gap?",
    "How does neonatal mortality map onto healthcare access and resource wealth?",
  ],
  hiv_incidence: [
    "Where is new HIV infection most prevalent?",
    "How does HIV incidence overlap with poverty, healthcare access, and inequality?",
  ],
  trade_openness: [
    "Which economies are most exposed to global trade flows?",
    "How does trade openness connect to commodity dependence and vulnerability?",
  ],
  remittances: [
    "Which countries depend most on remittances from abroad?",
    "How do remittances compare to foreign aid and resource rents as income sources?",
  ],
  education_expenditure: [
    "Which governments spend the least on education as a share of GDP?",
    "How does education investment compare to resource wealth and development outcomes?",
  ],
  manuf_value_added: [
    "Which countries have the smallest manufacturing sector?",
    "How does manufacturing capacity connect to supply chain risk and resource extraction?",
  ],
  agri_value_added: [
    "Where does agriculture make up the biggest share of the economy?",
    "How does agrarian dependency relate to hunger, climate risk, and land use?",
  ],
  electricity_per_capita: [
    "Where is per-capita electricity consumption lowest?",
    "How does electricity access map onto energy poverty and industrial development?",
  ],
  diabetes_prevalence: [
    "Where is diabetes most widespread, and what's driving the nutrition transition?",
    "How does diabetes connect to trade, food systems, and ultra-processed food imports?",
  ],
  inflation: [
    "Where is inflation highest, and what does it mean for food and energy prices?",
    "How does inflation map onto commodity dependence and economic vulnerability?",
  ],
  air_pollution_deaths: [
    "Where does air pollution cause the most deaths per person?",
    "How do PM2.5 exposure levels translate into mortality across countries?",
  ],
  hospital_beds: [
    "Where are there the fewest hospital beds per person?",
    "How does healthcare infrastructure compare to disease burden?",
  ],
  road_deaths: [
    "Where are road traffic deaths highest per capita?",
    "How do road safety and infrastructure connect to development?",
  ],
  safe_sanitation: [
    "Where do the fewest people have access to safely managed sanitation?",
    "How does the sanitation gap extend beyond basic access to safe waste management?",
  ],
  food_insecurity_severe: [
    "Where is severe food insecurity most widespread?",
    "How does acute food insecurity overlap with conflict, drought, and poverty?",
  ],
  poverty_gap: [
    "Where are the poorest people furthest from the poverty line?",
    "How does the depth of poverty compare to resource wealth?",
  ],
  threatened_mammals: [
    "Which countries have the most mammal species at risk of extinction?",
    "How does mammal threat overlap with deforestation and resource extraction?",
  ],
  threatened_fish: [
    "Which countries have the most fish species at risk of extinction?",
    "How does fish species loss connect to overfishing, pollution, and habitat destruction?",
  ],
  unemployment: [
    "Where is unemployment highest, and who does it fall on?",
    "How does joblessness connect to resource dependence and economic structure?",
  ],
  adult_literacy: [
    "Where is adult literacy lowest, and what keeps people from learning to read?",
    "How does literacy connect to economic access, health outcomes, and land rights?",
  ],
  mobile_subscriptions: [
    "Where is mobile connectivity lowest — and what does the digital gap mean for access?",
    "How does mobile infrastructure connect to economic inclusion and trade?",
  ],
  stunting: [
    "Where is child stunting most prevalent, and what's driving chronic undernutrition?",
    "How does stunting map onto hunger, water stress, and poverty?",
  ],
  suicide_rate: [
    "Where is suicide mortality highest, and what does it reflect about mental health burdens?",
    "How does suicide rate connect to poverty, inequality, and social isolation?",
  ],
  control_of_corruption: [
    "Where is governance weakest on corruption control?",
    "How does corruption connect to resource wealth and the 'resource curse'?",
  ],
  tobacco_deaths: [
    "Where does tobacco cause the most deaths per person?",
    "How do tobacco supply chains and marketing connect to mortality burden?",
  ],
  alcohol_consumption: [
    "Where is alcohol consumption highest per person?",
    "How does drinking connect to health burden, poverty, and food systems?",
  ],
  hydro_electricity: [
    "Which countries rely most on hydropower for electricity?",
    "How does hydro dependence connect to water stress and climate risk?",
  ],
  renewable_electricity_xhydro: [
    "Which countries have the highest share of solar and wind in their electricity mix?",
    "Where is the clean energy transition moving fastest beyond hydropower?",
  ],
  tech_exports: [
    "Which countries export the highest share of high-technology goods?",
    "How does technological sophistication connect to supply chain positioning?",
  ],
  gross_savings: [
    "Which countries have the lowest savings rates, and what does it mean for investment?",
    "How does savings capacity connect to resource dependence and economic vulnerability?",
  ],
  current_account: [
    "Which countries run the largest current account deficits?",
    "How does trade balance connect to commodity export dependence?",
  ],
  uhc_coverage: [
    "Where is universal health coverage lowest?",
    "How does health system access compare to disease burden in resource-rich countries?",
  ],
  food_production_index: [
    "Which countries have seen the biggest changes in food production?",
    "How does food production growth connect to land use, water stress, and trade?",
  ],
  out_of_pocket_health: [
    "Where do people pay the most out-of-pocket for healthcare?",
    "How does out-of-pocket burden connect to poverty and health outcomes?",
  ],
  tax_revenue: [
    "Which governments collect the least tax revenue relative to their economy?",
    "How does fiscal capacity connect to public services, poverty, and resource rents?",
  ],
  cardiovascular_deaths: [
    "Where are cardiovascular deaths highest per capita?",
    "How do diet, pollution, and healthcare access drive heart disease mortality?",
  ],
  coal_electricity: [
    "Which countries still generate the most electricity from coal?",
    "Where is coal-power lock-in blocking the clean energy transition?",
  ],
  gas_electricity: [
    "Which countries rely most on natural gas for electricity?",
    "How does gas-power dependence connect to LNG trade and energy security?",
  ],
  oil_electricity: [
    "Which countries still burn oil for electricity — and why?",
    "How does oil-for-power connect to import dependence and energy poverty?",
  ],
  fertility_rate: [
    "Where is fertility highest, and what drives large family sizes?",
    "How does fertility connect to education, women's rights, and poverty?",
  ],
  pop_over_65: [
    "Where is the population aging fastest?",
    "How does an aging population affect labor force, pensions, and resource demand?",
  ],
  pop_under_14: [
    "Where is the youngest population, and what does it mean for future labor and consumption?",
    "How does a youth bulge connect to education demand, jobs, and migration?",
  ],
  population_density: [
    "Where are people most densely concentrated?",
    "How does density shape resource demand, infrastructure needs, and climate risk?",
  ],
  gni_per_capita_ppp: [
    "Where is purchasing-power-adjusted income lowest?",
    "How does PPP income compare to resource wealth in extractive economies?",
  ],
  electricity_losses: [
    "Where do electricity grids lose the most power in transmission?",
    "How do grid losses connect to energy poverty and investment gaps?",
  ],
  homicide_rate: [
    "Where is homicide highest, and what's driving it?",
    "How do violence levels map onto resource extraction, inequality, and governance?",
  ],
  alcohol_deaths: [
    "Where does harmful alcohol use cause the most deaths per person?",
    "How does alcohol mortality connect to poverty, inequality, and mental health burdens?",
  ],
  drug_deaths: [
    "Where are drug use disorder deaths highest, and why?",
    "How do drug mortality rates relate to supply chains, governance, and economic stress?",
  ],
  employment_ratio: [
    "Which countries have the highest share of working-age adults employed?",
    "How does the employment ratio differ between resource-dependent and diversified economies?",
  ],
  broadband: [
    "Where is fixed broadband access concentrated, and who is left behind?",
    "How does broadband penetration correlate with education, exports, and development?",
  ],
  military_expenditure: [
    "Which countries spend the most on their military relative to their GDP?",
    "How does military spending relate to conflict, resource extraction, and governance?",
  ],
  energy_intensity: [
    "Which economies are least energy-efficient and why does it matter?",
    "How does energy intensity track alongside fossil fuel subsidies and industrialisation?",
  ],
  business_days: [
    "Where is it hardest to legally start a business, and what are the consequences?",
    "How does red tape at business registration connect to informality and investment gaps?",
  ],
  rule_of_law: [
    "Where is the rule of law weakest, and how does that shape resource extraction?",
    "How does rule-of-law quality interact with corruption, investment, and conflict risk?",
  ],
  political_stability: [
    "Which countries face the highest risk of political violence or instability?",
    "How does political instability affect supply chain reliability and foreign investment?",
  ],
  gov_effectiveness: [
    "Where is government capacity to deliver services lowest?",
    "How does government effectiveness correlate with health outcomes and infrastructure quality?",
  ],
  ores_metals_exports: [
    "Which countries depend most on mineral and metal exports?",
    "How does high ore and metals export concentration link to the resource curse?",
  ],
  fuel_exports: [
    "Which economies are most dependent on fossil fuel exports?",
    "How does fuel export dependence shape vulnerability to the energy transition?",
  ],
  cancer_deaths: [
    "Where are cancer death rates highest, and what types dominate?",
    "How does cancer mortality connect to tobacco, air pollution, and healthcare access?",
  ],
  agricultural_employment: [
    "Where do most people still work in agriculture, and what does that mean for food security?",
    "How does high agricultural employment connect to rural poverty and smallholder land rights?",
  ],
  self_employment: [
    "Which countries have the highest rates of self-employment, and why?",
    "How does self-employment concentration reflect informality, social protection gaps, and economic structure?",
  ],
  immunization_dtp: [
    "Where is childhood immunization coverage lowest, and what drives the gaps?",
    "How does DTP immunization correlate with child mortality, healthcare access, and conflict?",
  ],
  co2_intensity_gdp: [
    "Which economies produce the most CO₂ per dollar of output?",
    "How does carbon intensity of GDP relate to energy mix, industrial structure, and climate commitments?",
  ],
  fdi_inflows: [
    "Which countries attract the most foreign direct investment relative to their economy?",
    "How does FDI flow connect to resource extraction, governance, and development outcomes?",
  ],
  food_imports_share: [
    "Which countries are most dependent on imported food and why does it matter?",
    "How does food import dependency create vulnerability to supply chain shocks and price spikes?",
  ],
  malaria_deaths: [
    "Where is malaria mortality still highest, and what's holding back control efforts?",
    "How do malaria death rates overlap with poverty, climate, and access to healthcare?",
  ],
  diarrhea_deaths: [
    "Where do diarrheal diseases still kill the most people, and why?",
    "How does diarrheal mortality map onto water access, sanitation, and child health?",
  ],
  tertiary_enrollment: [
    "Which countries have the highest rates of higher education access?",
    "How does tertiary enrollment connect to economic complexity and innovation capacity?",
  ],
  rural_electricity: [
    "Where do rural communities still lack electricity access?",
    "How does the rural–urban electricity gap connect to agricultural productivity and migration?",
  ],
  domestic_credit: [
    "Which economies have the deepest private credit markets?",
    "How does domestic credit as a share of GDP relate to investment, inequality, and financial risk?",
  ],
  secure_servers: [
    "Which countries have the most developed secure internet infrastructure?",
    "How do secure server counts relate to e-commerce, governance, and digital sovereignty?",
  ],
};

const GENERAL_SUGGESTIONS = [
  "Who controls this resource, who benefits, and who bears the costs?",
  "What are communities doing in response?",
  "Where are the biggest data gaps?",
];

// ─── Layer category definitions ────────────────────────────────────────────
const LAYER_CATEGORIES: {
  id: string;
  label: string;
  color: string;
  ids: string[];
}[] = [
  {
    id: "critical_minerals",
    label: "Critical Minerals",
    color: "#7c3aed",
    ids: [
      "cobalt_production","cobalt_reserves","lithium_production","graphite_production",
      "copper_production","nickel_production","rare_earths_production","tin_production",
      "tungsten_production","tantalum_production","manganese_production","gold_production",
      "silver_production","iron_ore_production","zinc_production","lead_production",
      "bauxite_production","antimony_production","molybdenum_production",
      "phosphate_production","potash_production",
    ],
  },
  {
    id: "agriculture",
    label: "Agriculture & Food",
    color: "#d97706",
    ids: [
      "wheat_production","maize_production","rice_production","soybean_production",
      "coffee_production","cocoa_production","palm_oil_production","sugarcane_production",
      "banana_production","potato_production","cassava_production","meat_production",
      "milk_production","fish_catch","aquaculture","cereal_yield","fertilizer_use",
      "agri_land","caloric_supply","food_production_index","food_imports_share",
      "agricultural_employment",
    ],
  },
  {
    id: "water_land",
    label: "Water & Land",
    color: "#0284c7",
    ids: [
      "water_access_basic","renew_water_pc","water_stress","forest_area",
      "forest_rents","land_degradation","arable_land",
      "terrestrial_protected","marine_protected",
    ],
  },
  {
    id: "energy",
    label: "Energy",
    color: "#dc2626",
    ids: [
      "coal_production","oil_production","gas_production","renewable_energy",
      "energy_per_capita","electricity_per_capita","hydro_electricity",
      "renewable_electricity_xhydro","coal_electricity","gas_electricity","oil_electricity",
      "electricity_losses","coal_rents","oil_rents","gas_rents",
      "resource_rents_total","mineral_rents","energy_intensity",
    ],
  },
  {
    id: "human_dev",
    label: "Human Development",
    color: "#16a34a",
    ids: [
      "poverty_headcount","undernourishment","electricity_access","clean_cooking",
      "basic_sanitation","gini","life_expectancy","child_mortality",
      "tuberculosis","physicians","neonatal_mortality","hiv_incidence",
      "diabetes_prevalence","hospital_beds","road_deaths","safe_sanitation",
      "food_insecurity_severe","stunting","suicide_rate","tobacco_deaths",
      "alcohol_consumption","uhc_coverage","cardiovascular_deaths",
      "homicide_rate","alcohol_deaths","drug_deaths","cancer_deaths",
      "malaria_deaths","diarrhea_deaths","immunization_dtp","rural_electricity",
      "exports_value","imports_value",
    ],
  },
  {
    id: "emissions",
    label: "Emissions & Pollution",
    color: "#374151",
    ids: [
      "co2_per_capita","co2_total","methane_total","n2o_total",
      "pm25_exposure","air_pollution_deaths","plastic_waste_pc",
      "plastic_to_ocean_share","plastic_waste_total","plastic_to_ocean_total",
      "co2_intensity_gdp",
    ],
  },
  {
    id: "biodiversity",
    label: "Biodiversity",
    color: "#059669",
    ids: ["threatened_birds","threatened_plants","threatened_mammals","threatened_fish"],
  },
  {
    id: "economy_demog",
    label: "Economy & Development",
    color: "#7c2d12",
    ids: [
      "gdp_per_capita","internet_access","school_enrollment",
      "access_to_finance","maternal_mortality","obesity_adults","energy_per_capita",
      "hdi","urban_population","health_expenditure","female_labor","secondary_enrollment",
      "women_in_parliament","trade_openness","remittances","education_expenditure",
      "manuf_value_added","agri_value_added","inflation","poverty_gap",
      "unemployment","adult_literacy","mobile_subscriptions","control_of_corruption",
      "tech_exports","gross_savings","current_account",
      "out_of_pocket_health","tax_revenue","food_production_index",
      "fertility_rate","pop_over_65","pop_under_14","population_density","gni_per_capita_ppp",
      "employment_ratio","broadband","military_expenditure","business_days",
      "rule_of_law","political_stability","gov_effectiveness",
      "ores_metals_exports","fuel_exports",
      "fdi_inflows","self_employment",
      "tertiary_enrollment","domestic_credit","secure_servers",
    ],
  },
];

// ─── Layer Browser sub-component ────────────────────────────────────────────
function LeftLayerBrowser({
  layers,
  activeLayers,
  setActiveLayers,
}: {
  layers: LayerMeta[];
  activeLayers: string[];
  setActiveLayers: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});

  const layerById = Object.fromEntries(layers.map((l) => [l.id, l]));

  const filtered = search.trim()
    ? layers.filter(
        (l) =>
          l.label.toLowerCase().includes(search.toLowerCase()) ||
          l.id.toLowerCase().includes(search.toLowerCase())
      )
    : null;

  function selectLayer(id: string) {
    // Radio-style: clicking the active layer clears it; otherwise select it.
    setActiveLayers((prev) => (prev.includes(id) ? [] : [id]));
  }

  function toggleCat(catId: string) {
    setOpenCats((prev) => ({ ...prev, [catId]: !prev[catId] }));
  }

  return (
    <section className="border-b border-earth-100">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-[9.5px] font-semibold uppercase tracking-widest text-earth-400 hover:bg-earth-50/60"
      >
        <span>Browse all layers</span>
        <span className="text-earth-300">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          {/* Search */}
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search layers…"
            className="mb-2.5 w-full rounded-lg border border-earth-200 bg-white px-2.5 py-1.5 text-[11px] text-earth-800 outline-none focus:border-earth-400 focus:ring-1 focus:ring-earth-200 placeholder:text-earth-400"
          />

          {filtered ? (
            // Flat search results
            <div className="space-y-1">
              {filtered.length === 0 ? (
                <p className="text-[11px] text-earth-400 italic">No layers match.</p>
              ) : (
                filtered.map((l) => {
                  const active = activeLayers.includes(l.id);
                  return (
                    <button
                      key={l.id}
                      onClick={() => selectLayer(l.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] transition ${
                        active
                          ? "bg-earth-100 font-medium text-earth-900"
                          : "text-earth-700 hover:bg-earth-50"
                      }`}
                    >
                      <span
                        className={`h-3 w-3 shrink-0 rounded-full border-2 transition ${
                          active ? "border-earth-700 bg-earth-700" : "border-earth-300 bg-white"
                        }`}
                      />
                      <span className="truncate">{l.label}</span>
                    </button>
                  );
                })
              )}
            </div>
          ) : (
            // Categorized view
            <div className="space-y-1">
              {LAYER_CATEGORIES.map((cat) => {
                const catLayers = cat.ids
                  .map((id) => layerById[id])
                  .filter(Boolean) as LayerMeta[];
                if (catLayers.length === 0) return null;
                const isCatOpen = openCats[cat.id] ?? false;
                const activeCount = catLayers.filter((l) =>
                  activeLayers.includes(l.id)
                ).length;
                return (
                  <div key={cat.id}>
                    <button
                      onClick={() => toggleCat(cat.id)}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-earth-50/60"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: cat.color }}
                        />
                        <span className="text-[11px] font-medium text-earth-800">
                          {cat.label}
                        </span>
                        {activeCount > 0 && (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold text-white"
                            style={{ background: cat.color }}
                          >
                            {activeCount}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="text-[9px] text-earth-400">
                          {catLayers.length}
                        </span>
                        <span className="text-[9px] text-earth-300">
                          {isCatOpen ? "▲" : "▼"}
                        </span>
                      </span>
                    </button>
                    {isCatOpen && (
                      <div className="ml-4 mt-0.5 space-y-0.5">
                        {catLayers.map((l) => {
                          const active = activeLayers.includes(l.id);
                          return (
                            <button
                              key={l.id}
                              onClick={() => selectLayer(l.id)}
                              title={`${l.source_name} · ${l.unit}`}
                              className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[10.5px] transition ${
                                active
                                  ? "bg-earth-100 font-medium text-earth-900"
                                  : "text-earth-600 hover:bg-earth-50 hover:text-earth-800"
                              }`}
                            >
                              <span
                                className={`h-3 w-3 shrink-0 rounded-full border-2 transition`}
                                style={{
                                  borderColor: active ? cat.color : "#d1d5db",
                                  background: active ? cat.color : "white",
                                }}
                              />
                              <span className="truncate">{l.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Live Overlays sub-component ────────────────────────────────────────────
function LeftOverlaysSection({
  showMines, setShowMines,
  showBoundariesMap, setShowBoundariesMap,
  showCities, setShowCities,
  showPorts, setShowPorts,
  showStates, setShowStates,
  showDisasters, setShowDisasters,
  showVessels, setShowVessels,
  showFarms, setShowFarms,
  showCams, setShowCams,
  showCountyData, setShowCountyData,
  showClimate, setShowClimate,
  showTrade, setShowTrade,
  countyMetric, setCountyMetric,
}: {
  showMines: boolean; setShowMines: React.Dispatch<React.SetStateAction<boolean>>;
  showBoundariesMap: boolean; setShowBoundariesMap: React.Dispatch<React.SetStateAction<boolean>>;
  showCities: boolean; setShowCities: React.Dispatch<React.SetStateAction<boolean>>;
  showPorts: boolean; setShowPorts: React.Dispatch<React.SetStateAction<boolean>>;
  showStates: boolean; setShowStates: React.Dispatch<React.SetStateAction<boolean>>;
  showDisasters: boolean; setShowDisasters: React.Dispatch<React.SetStateAction<boolean>>;
  showVessels: boolean; setShowVessels: React.Dispatch<React.SetStateAction<boolean>>;
  showFarms: boolean; setShowFarms: React.Dispatch<React.SetStateAction<boolean>>;
  showCams: boolean; setShowCams: React.Dispatch<React.SetStateAction<boolean>>;
  showCountyData: boolean; setShowCountyData: React.Dispatch<React.SetStateAction<boolean>>;
  showClimate: boolean; setShowClimate: React.Dispatch<React.SetStateAction<boolean>>;
  showTrade: boolean; setShowTrade: React.Dispatch<React.SetStateAction<boolean>>;
  countyMetric: string; setCountyMetric: React.Dispatch<React.SetStateAction<string>>;
}) {
  const [open, setOpen] = useState(false);

  const overlays: [string, boolean, React.Dispatch<React.SetStateAction<boolean>>, string, string][] = [
    ["Mines & deposits", showMines, setShowMines, "#d97706", "2,121 real mines, deposits & districts of critical minerals (USGS Professional Paper 1802)"],
    ["Planetary boundaries", showBoundariesMap, setShowBoundariesMap, "#0d9488", "9 planetary boundaries (6 transgressed) as a global wedge ring — Richardson et al. 2023"],
    ["Cities", showCities, setShowCities, "#0f766e", "7,342 real cities sized by population (Natural Earth Populated Places, 10m)"],
    ["Ports", showPorts, setShowPorts, "#1e3a8a", "1,081 global ports (Natural Earth 10m)"],
    ["States/provinces", showStates, setShowStates, "#7c5ca8", "3,909 admin-1 states/provinces worldwide (Natural Earth 10m)"],
    ["Disasters", showDisasters, setShowDisasters, "#dc2626", "Live NASA EONET events + USGS earthquakes"],
    ["Vessels", showVessels, setShowVessels, "#0284c7", "Live global AIS vessel positions (AISStream.io)"],
    ["Field boundaries", showFarms, setShowFarms, "#16a34a", "Global Sentinel-2 field boundaries (Fields of The World, CC-BY-4.0)"],
    ["Webcams", showCams, setShowCams, "#7c3aed", "Live public traffic cameras (TfL JamCams, London)"],
    ["US county data", showCountyData, setShowCountyData, "#16a34a", "US county choropleth from County Health Rankings 2024 (Univ. of Wisconsin / RWJF)"],
    ["US climate risk", showClimate, setShowClimate, "#b91c1c", "US county climate-habitability projections (Rhodium Group via ProPublica/NYT)"],
    ["Trade flows", showTrade, setShowTrade, "#d97706", "Bilateral export/import flows (World Bank WITS) — click a country"],
  ];

  const activeCount = overlays.filter(([, on]) => on).length;

  return (
    <section className="border-b border-earth-100">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-[9.5px] font-semibold uppercase tracking-widest text-earth-400 hover:bg-earth-50/60"
      >
        <span className="flex items-center gap-1.5">
          Live overlays
          {activeCount > 0 && (
            <span className="rounded-full bg-earth-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">
              {activeCount}
            </span>
          )}
        </span>
        <span className="text-earth-300">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          <div className="grid grid-cols-2 gap-1">
            {overlays.map(([label, on, set, color, title]) => (
              <button
                key={label}
                onClick={() => set((v) => !v)}
                aria-pressed={on}
                title={title}
                className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-medium transition ${
                  on
                    ? "border-earth-400 bg-earth-50 text-earth-900"
                    : "border-earth-200 bg-white text-earth-600 hover:bg-earth-50"
                }`}
              >
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ background: on ? color : "#cbd5e1" }}
                />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>

          {showCountyData && (
            <div className="mt-2 rounded-lg border border-green-200 bg-green-50/60 px-2 py-1.5">
              <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-green-700">
                County metric · County Health Rankings 2024
              </div>
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ["income", "Median income"],
                    ["child_pov", "Child poverty"],
                    ["uninsured", "Uninsured"],
                    ["life_exp", "Life expectancy"],
                    ["premature_death", "Premature death"],
                    ["obesity", "Adult obesity"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setCountyMetric(id)}
                    aria-pressed={countyMetric === id}
                    className={`rounded-full border px-2 py-0.5 text-[10px] transition ${
                      countyMetric === id
                        ? "border-green-600 bg-green-600 text-white"
                        : "border-green-300 bg-white text-green-800 hover:bg-green-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-1 text-[9px] text-green-700/80">
                Green = better outcome · red = worse.
              </div>
            </div>
          )}

          <p className="mt-1.5 text-[9px] leading-snug text-earth-400">
            Live data fetched client-side (EONET · USGS · AIS · Sentinel-2 · TfL).
            Hover any marker for its source.
          </p>
        </div>
      )}
    </section>
  );
}

// ─── Context sub-component ───────────────────────────────────────────────────
function LeftContextSection({
  showBoundaries, setShowBoundaries,
  showDrawdown, setShowDrawdown,
  showPlans, setShowPlans,
  activePlanId,
  openPlan,
  closePlan,
}: {
  showBoundaries: boolean; setShowBoundaries: React.Dispatch<React.SetStateAction<boolean>>;
  showDrawdown: boolean; setShowDrawdown: React.Dispatch<React.SetStateAction<boolean>>;
  showPlans: boolean; setShowPlans: React.Dispatch<React.SetStateAction<boolean>>;
  activePlanId: string | null;
  openPlan: (plan: CollabPlan) => void;
  closePlan: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="border-b border-earth-100">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-[9.5px] font-semibold uppercase tracking-widest text-earth-400 hover:bg-earth-50/60"
      >
        <span>Context</span>
        <span className="text-earth-300">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-3">
          {/* Planetary boundaries */}
          <div className="rounded-xl border border-earth-200 p-2.5">
            <button
              onClick={() => setShowBoundaries((v) => !v)}
              className="flex w-full items-center justify-between text-[11px] font-semibold text-earth-600"
            >
              <span>Planetary boundaries</span>
              <span className="text-earth-400">{showBoundaries ? "▲" : "▼"}</span>
            </button>
            {showBoundaries && (
              <div className="mt-2">
                <PlanetaryBoundariesPanel />
              </div>
            )}
          </div>

          {/* Drawdown */}
          <div className="rounded-xl border border-earth-200 p-2.5">
            <button
              onClick={() => setShowDrawdown((v) => !v)}
              className="flex w-full items-center justify-between text-[11px] font-semibold text-earth-600"
            >
              <span>Climate solutions (Drawdown)</span>
              <span className="text-earth-400">{showDrawdown ? "▲" : "▼"}</span>
            </button>
            {showDrawdown && (
              <div className="mt-2">
                <DrawdownPanel />
              </div>
            )}
          </div>

          {/* Collaborative plans */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-2.5">
            <button
              onClick={() => setShowPlans((v) => !v)}
              className="flex w-full items-center justify-between text-[11px] font-semibold text-emerald-700"
            >
              <span>Collaborative plans</span>
              <span className="text-emerald-500">{showPlans ? "▲" : "▼"}</span>
            </button>
            {showPlans && (
              <div className="mt-2">
                <CollabPlansPanel
                  activePlanId={activePlanId}
                  onOpen={openPlan}
                  onClose={closePlan}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Map Legend overlay ───────────────────────────────────────────────────────
// Floating legend anchored bottom-center of the globe canvas. Shows the viridis
// ramp with actual min/max values from the live data — not invented ranges.
// Only renders for a single active layer (multi-layer composite gets no legend).
function MapLegend({
  activeMetas,
  composite,
}: {
  activeMetas: LayerMeta[];
  composite: CompositePayload | null;
}) {
  if (activeMetas.length !== 1 || !composite) return null;
  const meta = activeMetas[0];

  const vals = Object.values(composite.byIso)
    .map((e) => e.layers[meta.id]?.value)
    .filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
  if (vals.length === 0) return null;

  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);

  function fmtV(v: number): string {
    const u = meta.unit;
    if (u === "%") return `${v.toFixed(1)}%`;
    if (u === "years") return `${v.toFixed(0)} yrs`;
    if (u === "per 1000") return `${v.toFixed(0)}/1k`;
    if (u === "µg/m³") return `${v.toFixed(0)} µg/m³`;
    if (u === "species" || u === "index") return `${Math.round(v)}`;
    if (u === "t/capita") return `${v.toFixed(1)} ${u}`;
    if (u === "m³/capita") return `${new Intl.NumberFormat(undefined,{notation:"compact",maximumFractionDigits:1}).format(v)} ${u}`;
    if (u === "kg/ha") return `${Math.round(v).toLocaleString()} ${u}`;
    // large quantities (t, TWh, Mt, US$)
    return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(v) + (u && u !== "US$" ? ` ${u}` : "");
  }

  // viridis ramp: severity 0 = dark purple, severity 1 = yellow.
  // For higher_is_worse or world_share: low value → purple, high → yellow.
  // For NOT higher_is_worse (magnitude/percent): high value → purple, low → yellow.
  const isPosDir = meta.higher_is_worse || meta.display === "world_share";
  const leftVal  = isPosDir ? minVal : maxVal;
  const rightVal = isPosDir ? maxVal : minVal;

  return (
    <div className="pointer-events-none absolute bottom-16 left-1/2 z-20 -translate-x-1/2">
      <div className="rounded-xl border border-earth-200 bg-white/92 px-3 py-2 shadow-lg backdrop-blur-sm">
        <div className="mb-1.5 max-w-[300px] truncate text-center text-[10px] font-semibold text-earth-700">
          {meta.label}
        </div>
        <div className="flex items-center gap-2">
          <div className="min-w-[48px] text-right">
            <div className="text-[10px] font-medium tabular-nums text-earth-700">{fmtV(leftVal)}</div>
            <div className="text-[8px] text-earth-400">{isPosDir ? "least" : "most"}</div>
          </div>
          <div className="flex h-3 w-44 shrink-0 overflow-hidden rounded-sm">
            {["#440154","#31688e","#1f9e89","#6ece58","#fde725"].map((c) => (
              <span key={c} className="flex-1" style={{ background: c }} />
            ))}
          </div>
          <div className="min-w-[48px]">
            <div className="text-[10px] font-medium tabular-nums text-earth-700">{fmtV(rightVal)}</div>
            <div className="text-[8px] text-earth-400">{isPosDir ? "most" : "least"}</div>
          </div>
        </div>
        <div className="mt-1 text-center text-[8px] text-earth-400">
          {vals.length} countries with data · {meta.source_name}
        </div>
      </div>
    </div>
  );
}

const GlobeMap = dynamic(() => import("@/components/GlobeView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-earth-500">
      Loading globe…
    </div>
  ),
});
const NetworkGraph = dynamic(() => import("@/components/NetworkGraph"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-earth-500">
      Loading graph…
    </div>
  ),
});

export default function Home() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<GroundedAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"globe" | "mercator" | "satellite">("globe");
  const [highlight, setHighlight] = useState<string[]>([]);
  const [showGraph, setShowGraph] = useState(false);
  const [showMines, setShowMines] = useState(false);
  const [showCities, setShowCities] = useState(false);
  const [showPorts, setShowPorts] = useState(false);
  const [showStates, setShowStates] = useState(false);
  const [showCountyData, setShowCountyData] = useState(false);
  const [countyMetric, setCountyMetric] = useState("income");
  const [showDisasters, setShowDisasters] = useState(false);
  const [showVessels, setShowVessels] = useState(false);
  const [showFarms, setShowFarms] = useState(false);
  const [showCams, setShowCams] = useState(false);
  const [showClimate, setShowClimate] = useState(false);
  const [showTrade, setShowTrade] = useState(false);
  const [showDrawdown, setShowDrawdown] = useState(false);
  const [showBoundaries, setShowBoundaries] = useState(false);
  const [showBoundariesMap, setShowBoundariesMap] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  // The open plan drives both the panel detail and the map overlay/fly-to.
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [planEntities, setPlanEntities] = useState<PlanEntity[]>([]);
  const [planFocus, setPlanFocus] = useState<
    { lat: number; lon: number; zoom: number } | null
  >(null);
  const [selectedIso, setSelectedIso] = useState<string | undefined>(undefined);
  const [countryPanelOpen, setCountryPanelOpen] = useState(true);
  const [layers, setLayers] = useState<LayerMeta[]>([]);
  // Layers are now FILTERS: any number can be active at once.
  const [activeLayers, setActiveLayers] = useState<string[]>([
    "cobalt_production",
  ]);
  const [composite, setComposite] = useState<CompositePayload | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const layerKey = activeLayers.join(",");

  function toggleLayer(id: string) {
    setActiveLayers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  // Bring a layer to the front (make it the primary/displayed choropleth)
  // without dropping whatever else is on — used to "spatialize" a planetary
  // boundary onto its real per-country pressure proxy.
  function showLayer(id: string) {
    setActiveLayers((prev) => [...prev.filter((x) => x !== id), id]);
    setLeftOpen(true);
  }

  // Open a collaborative plan: load its mapped entities onto the globe and fly
  // the camera to the plan focus. Force globe mode so the fly-to frames cleanly.
  function openPlan(plan: CollabPlan) {
    setActivePlanId(plan.id);
    setPlanEntities(plan.entities);
    setMode("globe");
    // New object each open so GlobeView's focus effect re-fires.
    setPlanFocus({ ...plan.focus });
    setShowPlans(true);
    setLeftOpen(true);
  }
  function closePlan() {
    setActivePlanId(null);
    setPlanEntities([]);
    setPlanFocus(null);
  }

  // Suggestions follow the most recently added filter (then a general set).
  const suggestions = useMemo(() => {
    const primary = activeLayers[activeLayers.length - 1];
    const perLayer = (primary && LAYER_SUGGESTIONS[primary]) || [];
    return [...perLayer, ...GENERAL_SUGGESTIONS].slice(0, 3);
  }, [activeLayers]);

  useEffect(() => {
    fetch("/api/layers")
      .then((r) => r.json())
      .then((d) => setLayers(d.layers ?? []))
      .catch(() => setLayers([]));
  }, []);

  useEffect(() => {
    setComposite(null);
    if (activeLayers.length === 0) {
      setComposite({ layers: [], worldTotals: {}, byIso: {} });
      return;
    }
    const qs = activeLayers.map((l) => `layer=${encodeURIComponent(l)}`).join("&");
    fetch(`/api/composite?${qs}`)
      .then((r) => r.json())
      .then((d: CompositePayload) => setComposite(d?.byIso ? d : null))
      .catch(() => setComposite(null));
  }, [layerKey]);

  const activeMetas = useMemo(
    () => layers.filter((l) => activeLayers.includes(l.id)),
    [layers, activeLayers]
  );

  // Highlights:
  //  - one filter  → direction-aware ranking of that metric's real values.
  //  - many filters → countries ranked by COMBINED severity (the composite),
  //    each item labelled with its overall % (mean of normalized filters).
  const highlights = useMemo(() => {
    if (!composite) return null;
    const entries = Object.values(composite.byIso);
    const count = entries.length;
    if (activeMetas.length === 1) {
      const m = activeMetas[0];
      const lowestIsWorst = m.display !== "world_share" && !m.higher_is_worse;
      const rows = entries
        .map((e) => ({ name: e.name, lv: e.layers[m.id] }))
        .filter((r) => r.lv);
      rows.sort((a, b) =>
        lowestIsWorst ? a.lv!.value - b.lv!.value : b.lv!.value - a.lv!.value
      );
      const total = composite.worldTotals[m.id] ?? 0;
      const heading =
        HIGHLIGHT_HEADINGS[m.id] ??
        (m.display === "world_share"
          ? "Largest producers"
          : lowestIsWorst
          ? "Lowest coverage"
          : "Most affected");
      const top = rows.slice(0, 6).map((r) => ({
        country: r.name,
        label:
          m.display === "world_share" && total > 0
            ? `${((r.lv!.value / total) * 100).toFixed(1)}%`
            : fmt(r.lv!.value, r.lv!.unit),
      }));
      return { heading, top, count, multi: false };
    }
    // multiple filters → combined severity
    const rows = [...entries].sort((a, b) => b.composite - a.composite);
    const top = rows.slice(0, 6).map((e) => ({
      country: e.name,
      label: `${Math.round(e.composite * 100)}%`,
    }));
    return { heading: "Most affected overall", top, count, multi: true };
  }, [composite, activeMetas]);

  async function ask(q: string) {
    const query = q.trim();
    if (!query) return;
    setLoading(true);
    setError(null);
    setHighlight([]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query, activeLayers }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? res.statusText);
      setAnswer(await res.json());
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  const isoToEvidence = useMemo(() => {
    const m: Record<string, string[]> = {};
    answer?.countries.forEach((c) => {
      if (c.iso3) m[c.iso3] = c.evidenceIds;
    });
    return m;
  }, [answer]);

  const answerIso = useMemo(
    () =>
      (answer?.countries ?? [])
        .map((c) => c.iso3)
        .filter((x): x is string => Boolean(x)),
    [answer]
  );

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-gradient-to-b from-white to-earth-50">
      {/* ===== FULL-PAGE GLOBE BACKDROP ===== */}
      <div className="absolute inset-0">
        <GlobeMap
          mode={mode}
          layers={activeLayers}
          showMines={showMines}
          showCities={showCities}
          showPorts={showPorts}
          showStates={showStates}
          showCountyData={showCountyData}
          countyMetric={countyMetric}
          showDisasters={showDisasters}
          showVessels={showVessels}
          showFarms={showFarms}
          showCams={showCams}
          showClimate={showClimate}
          showTrade={showTrade}
          tradeIso={selectedIso}
          planEntities={planEntities}
          planFocus={planFocus}
          highlightIso={answerIso}
          onSelectIso={(iso) => {
            setSelectedIso(iso || undefined);
            setCountryPanelOpen(true); // auto-reopen panel on new country click
            if (iso && isoToEvidence[iso]) setHighlight(isoToEvidence[iso]);
          }}
        />
        <MapLegend activeMetas={activeMetas} composite={composite} />

        {/* Country panel — shown when open; minimized pill when hidden */}
        {selectedIso && countryPanelOpen && (
          <CountryImpactPanel
            iso={selectedIso}
            onClose={() => { setSelectedIso(undefined); setCountryPanelOpen(false); }}
            onMinimize={() => setCountryPanelOpen(false)}
          />
        )}
        {selectedIso && !countryPanelOpen && (
          <div className="pointer-events-auto absolute top-4 left-1/2 z-30 -translate-x-1/2 flex items-center gap-1.5 rounded-full border border-earth-300 bg-white/95 pl-3 pr-1.5 py-1.5 shadow-lg backdrop-blur-sm">
            <span className="h-2 w-2 shrink-0 rounded-full bg-earth-500" />
            <span className="text-[11px] font-medium text-earth-800">
              {composite?.byIso[selectedIso]?.name ?? selectedIso}
            </span>
            <button
              onClick={() => setCountryPanelOpen(true)}
              className="ml-0.5 rounded-full bg-earth-100 px-2 py-0.5 text-[10px] font-medium text-earth-700 hover:bg-earth-200"
            >
              expand ›
            </button>
            <button
              onClick={() => { setSelectedIso(undefined); setCountryPanelOpen(false); }}
              className="rounded-full px-1.5 py-0.5 text-[10px] text-earth-400 hover:bg-earth-100 hover:text-earth-700"
              aria-label="Clear country"
            >
              ✕
            </button>
          </div>
        )}
        {showBoundariesMap && (
          <PlanetaryBoundariesHUD
            onClose={() => setShowBoundariesMap(false)}
            onShowProxy={showLayer}
          />
        )}
      </div>

      {/* ===== LEFT INFO PANEL (collapsible) ===== */}
      {!leftOpen && (
        <button
          onClick={() => setLeftOpen(true)}
          className="absolute left-4 top-4 z-20 flex items-center gap-1.5 rounded-xl border border-earth-200 bg-white/90 px-3 py-2 text-xs font-medium text-earth-700 shadow-lg backdrop-blur hover:bg-earth-50"
          title="Show panel"
        >
          <span aria-hidden>☰</span> Layers
        </button>
      )}
      <aside
        className={`absolute left-4 top-4 bottom-4 z-10 flex w-[300px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-earth-200 bg-white/85 shadow-xl backdrop-blur-md transition-all duration-300 ${
          leftOpen
            ? "translate-x-0 opacity-100"
            : "pointer-events-none -translate-x-[120%] opacity-0"
        }`}
      >
        {/* ── Header ── */}
        <div className="shrink-0 border-b border-earth-100 px-4 pt-4 pb-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-[13px] font-bold tracking-tight text-earth-900">
              Planet to Particle
            </h1>
            <button
              onClick={() => setLeftOpen(false)}
              className="-mr-1 shrink-0 rounded-md px-1.5 py-0.5 text-earth-400 hover:bg-earth-100 hover:text-earth-700"
              title="Collapse panel"
              aria-label="Collapse panel"
            >
              ‹
            </button>
          </div>

          {/* ── View toggles ── */}
          <div className="mt-2.5 flex overflow-hidden rounded-lg border border-earth-200">
            {(
              [
                ["globe", "3D Globe"],
                ["mercator", "Flat"],
                ["satellite", "Satellite"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 px-2 py-1.5 text-[11px] font-medium transition ${
                  mode === m
                    ? "bg-earth-700 text-white"
                    : "bg-white text-earth-700 hover:bg-earth-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto">

          {/* ════════════════════════════════════════
              ACTIVE LAYER SECTION
          ════════════════════════════════════════ */}
          <section className="border-b border-earth-100 p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[9.5px] font-semibold uppercase tracking-widest text-earth-400">
                Active layer
              </span>
              {activeLayers.length > 0 && (
                <button
                  onClick={() => setActiveLayers([])}
                  className="text-[10px] text-earth-400 hover:text-earth-700 underline decoration-dotted"
                  title="Clear active layer"
                >
                  clear
                </button>
              )}
            </div>

            {activeLayers.length === 0 || !composite ? (
              <p className="text-[11px] text-earth-400 italic">
                {activeLayers.length === 0
                  ? "Select a layer below to see country data."
                  : "Loading…"}
              </p>
            ) : (
              <>
                {/* Layer name + year */}
                {activeMetas.length > 0 && (
                  <div className="mb-2">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[13px] font-semibold leading-tight text-earth-900">
                        {activeMetas.length === 1
                          ? activeMetas[0].label
                          : `${activeMetas.length} combined filters`}
                      </span>
                    </div>
                    {activeMetas.length === 1 && (
                      <div className="mt-0.5 text-[10px] text-earth-500">
                        {activeMetas[0].unit}
                      </div>
                    )}
                  </div>
                )}

                {/* Gradient bar */}
                {activeMetas.length > 0 && (() => {
                  if (activeMetas.length > 1) {
                    return (
                      <div className="mb-3">
                        <div className="flex h-3 w-full overflow-hidden rounded-sm">
                          {["#440154","#31688e","#1f9e89","#6ece58","#fde725"].map((c) => (
                            <span key={c} className="flex-1" style={{ background: c }} />
                          ))}
                        </div>
                        <div className="mt-0.5 flex justify-between text-[9.5px] text-earth-500">
                          <span>less affected</span>
                          <span>more affected</span>
                        </div>
                      </div>
                    );
                  }
                  // Single layer — compute actual min/max from composite data.
                  const m = activeMetas[0];
                  const vals = composite
                    ? Object.values(composite.byIso)
                        .map((e) => e.layers[m.id]?.value)
                        .filter((v): v is number => v != null && Number.isFinite(v) && v > 0)
                    : [];
                  const minV = vals.length ? Math.min(...vals) : null;
                  const maxV = vals.length ? Math.max(...vals) : null;
                  function fmtBar(v: number): string {
                    const u = m.unit;
                    if (u === "%") return `${v.toFixed(1)}%`;
                    if (u === "years") return `${v.toFixed(0)} yrs`;
                    if (u === "per 1000") return `${v.toFixed(0)}/1k`;
                    if (u === "µg/m³") return `${v.toFixed(0)} µg/m³`;
                    if (u === "species" || u === "index") return `${Math.round(v)}`;
                    return new Intl.NumberFormat(undefined,{notation:"compact",maximumFractionDigits:1}).format(v) + (u && u !== "US$" ? ` ${u}` : "");
                  }
                  const isPosDir = m.higher_is_worse || m.display === "world_share";
                  const leftV  = isPosDir ? minV : maxV;
                  const rightV = isPosDir ? maxV : minV;
                  return (
                    <div className="mb-3">
                      <div className="flex h-3 w-full overflow-hidden rounded-sm">
                        {["#440154","#31688e","#1f9e89","#6ece58","#fde725"].map((c) => (
                          <span key={c} className="flex-1" style={{ background: c }} />
                        ))}
                      </div>
                      <div className="mt-0.5 flex justify-between text-[9.5px] text-earth-500">
                        <span className="tabular-nums">
                          {leftV != null ? fmtBar(leftV) : (isPosDir ? "low" : "high")}
                        </span>
                        <span className="tabular-nums">
                          {rightV != null ? fmtBar(rightV) : (isPosDir ? "high" : "low")}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Ranked country list */}
                {highlights && highlights.top.length > 0 && (
                  <>
                    <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wide text-earth-400">
                      {highlights.heading}
                    </div>
                    <ol className="space-y-1.5">
                      {(() => {
                        // Compute max value for bar widths
                        const rawValues = Object.values(composite.byIso)
                          .map((e) => {
                            if (activeMetas.length === 1) {
                              const lv = e.layers[activeMetas[0].id];
                              return lv ? lv.value : 0;
                            }
                            return e.composite;
                          });
                        const maxVal = Math.max(...rawValues, 1);
                        const worldTotal = activeMetas.length === 1
                          ? (composite.worldTotals[activeMetas[0].id] ?? 0)
                          : 0;

                        return highlights.top.slice(0, 8).map((d, i) => {
                          // Find raw value for bar width
                          const entry = Object.values(composite.byIso).find(
                            (e) => e.name === d.country
                          );
                          let rawVal = 0;
                          if (entry) {
                            if (activeMetas.length === 1) {
                              rawVal = entry.layers[activeMetas[0].id]?.value ?? 0;
                            } else {
                              rawVal = entry.composite;
                            }
                          }
                          const pctBar = Math.round((rawVal / maxVal) * 100);
                          const pctWorld =
                            activeMetas.length === 1 &&
                            activeMetas[0].display === "world_share" &&
                            worldTotal > 0
                              ? ((rawVal / worldTotal) * 100).toFixed(1)
                              : null;

                          return (
                            <li key={d.country + i} className="group">
                              <div className="flex items-baseline justify-between gap-1 text-[11px]">
                                <span className="flex items-baseline gap-1 truncate text-earth-800">
                                  <span className="w-3.5 shrink-0 text-[9px] text-earth-400 tabular-nums">
                                    {i + 1}.
                                  </span>
                                  <span className="truncate">{d.country}</span>
                                </span>
                                <span className="shrink-0 font-medium tabular-nums text-earth-700">
                                  {pctWorld !== null ? `${pctWorld}%` : d.label}
                                </span>
                              </div>
                              <div className="mt-0.5 ml-4 h-1.5 w-full overflow-hidden rounded-full bg-earth-100">
                                <div
                                  className="h-full rounded-full bg-earth-500/60 transition-all"
                                  style={{ width: `${pctBar}%` }}
                                />
                              </div>
                            </li>
                          );
                        });
                      })()}
                    </ol>
                    <p className="mt-2 text-[9.5px] leading-snug text-earth-400">
                      {highlights.multi
                        ? `${highlights.count} countries ranked by combined severity · rest are data gaps (no value invented).`
                        : `${highlights.count} countries with data · rest are data gaps (no value invented).`}
                    </p>
                  </>
                )}

                {/* Source + action buttons */}
                {activeMetas.length === 1 && (
                  <div className="mt-2.5 border-t border-earth-100 pt-2">
                    <div className="mb-1.5 text-[9.5px] text-earth-500">
                      Source:{" "}
                      <a
                        href={activeMetas[0].source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-dotted hover:text-earth-700"
                      >
                        {activeMetas[0].source_name}
                      </a>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => {
                          const citation = `${activeMetas[0].label}. ${activeMetas[0].source_name}. Retrieved from ${activeMetas[0].source_url}`;
                          navigator.clipboard.writeText(citation);
                        }}
                        className="flex-1 rounded-md border border-earth-200 bg-white px-2 py-1 text-[10px] font-medium text-earth-700 hover:bg-earth-50 active:bg-earth-100"
                      >
                        Copy citation
                      </button>
                      <a
                        href={`/api/composite?layer=${encodeURIComponent(activeLayers[activeLayers.length - 1])}&format=csv`}
                        download
                        className="flex-1 rounded-md border border-earth-200 bg-white px-2 py-1 text-center text-[10px] font-medium text-earth-700 hover:bg-earth-50"
                      >
                        Data (CSV)
                      </a>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {/* ════════════════════════════════════════
              BROWSE ALL LAYERS SECTION
          ════════════════════════════════════════ */}
          <LeftLayerBrowser
            layers={layers}
            activeLayers={activeLayers}
            setActiveLayers={setActiveLayers}
          />

          {/* ════════════════════════════════════════
              LIVE OVERLAYS SECTION
          ════════════════════════════════════════ */}
          <LeftOverlaysSection
            showMines={showMines} setShowMines={setShowMines}
            showBoundariesMap={showBoundariesMap} setShowBoundariesMap={setShowBoundariesMap}
            showCities={showCities} setShowCities={setShowCities}
            showPorts={showPorts} setShowPorts={setShowPorts}
            showStates={showStates} setShowStates={setShowStates}
            showDisasters={showDisasters} setShowDisasters={setShowDisasters}
            showVessels={showVessels} setShowVessels={setShowVessels}
            showFarms={showFarms} setShowFarms={setShowFarms}
            showCams={showCams} setShowCams={setShowCams}
            showCountyData={showCountyData} setShowCountyData={setShowCountyData}
            showClimate={showClimate} setShowClimate={setShowClimate}
            showTrade={showTrade} setShowTrade={setShowTrade}
            countyMetric={countyMetric} setCountyMetric={setCountyMetric}
          />

          {/* ════════════════════════════════════════
              CONTEXT SECTION
          ════════════════════════════════════════ */}
          <LeftContextSection
            showBoundaries={showBoundaries} setShowBoundaries={setShowBoundaries}
            showDrawdown={showDrawdown} setShowDrawdown={setShowDrawdown}
            showPlans={showPlans} setShowPlans={setShowPlans}
            activePlanId={activePlanId}
            openPlan={openPlan}
            closePlan={closePlan}
          />

          {/* ════════════════════════════════════════
              START HERE SECTION
          ════════════════════════════════════════ */}
          <section className="p-3">
            <div className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-widest text-earth-400">
              Start here
            </div>
            <div className="space-y-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setQuestion(s);
                    ask(s);
                    setRightOpen(true);
                  }}
                  className="w-full rounded-lg border border-earth-200 bg-earth-50/60 px-2.5 py-2 text-left text-[11px] leading-snug text-earth-700 hover:border-earth-400 hover:bg-earth-100 transition"
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[9px] leading-snug text-earth-400">
              Answers are grounded only in real sources — gaps shown, never invented.
            </p>
          </section>

        </div>
      </aside>

      {/* ===== FLOATING QUERY + ANSWER PANEL (collapsible) ===== */}
      {!rightOpen && (
        <button
          onClick={() => setRightOpen(true)}
          className="absolute right-4 top-4 z-20 flex items-center gap-1.5 rounded-xl border border-earth-200 bg-white/90 px-3 py-2 text-xs font-medium text-earth-700 shadow-lg backdrop-blur hover:bg-earth-50"
          title="Show panel"
        >
          Ask <span aria-hidden>›</span>
        </button>
      )}
      <aside
        className={`absolute right-4 top-4 bottom-4 z-10 flex w-[420px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-earth-200 bg-white/85 shadow-xl backdrop-blur-md transition-all duration-300 ${
          rightOpen
            ? "translate-x-0 opacity-100"
            : "pointer-events-none translate-x-[120%] opacity-0"
        }`}
      >
        <div className="border-b border-earth-100 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-earth-500">
              Ask the map
            </span>
            <button
              onClick={() => setRightOpen(false)}
              className="-mr-1 rounded-md px-1.5 py-0.5 text-earth-400 hover:bg-earth-100 hover:text-earth-700"
              title="Collapse panel"
              aria-label="Collapse panel"
            >
              ›
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
            className="flex gap-2"
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What would you like to understand?"
              className="flex-1 rounded-lg border border-earth-300 bg-white px-3 py-2.5 text-sm text-earth-900 outline-none focus:border-earth-500 focus:ring-2 focus:ring-earth-200"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-earth-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-earth-800 disabled:opacity-50"
            >
              {loading ? "…" : "Ask"}
            </button>
          </form>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setQuestion(s);
                  ask(s);
                }}
                className="rounded-full border border-earth-200 bg-earth-50 px-2.5 py-1 text-[11px] text-earth-700 hover:border-earth-400"
              >
                {s}
              </button>
            ))}
          </div>
          {error && <p className="mt-2 text-xs text-rose-700">Error: {error}</p>}
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {!answer && !loading && (
            <div className="rounded-xl border border-dashed border-earth-200 bg-earth-50/50 p-6 text-center text-sm text-earth-600">
              The map shows{" "}
              <span className="font-semibold text-earth-800">
                {activeMetas.length === 0
                  ? "real source-grounded data"
                  : activeMetas.length === 1
                  ? activeMetas[0].label
                  : `${activeMetas.length} combined filters`}
              </span>{" "}
              on Natural Earth geometry. Toggle filters on the left, or ask a
              question to build a source-grounded answer beside it — every value
              traces to a real source; gaps are shown, never invented.
            </div>
          )}

          {answer && (
            <>
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-earth-500">
                  Source-grounded answer
                </h2>
                <div className="space-y-2.5">
                  {answer.narrative.map((seg, i) => (
                    <p
                      key={i}
                      className="text-sm leading-relaxed text-earth-900"
                    >
                      {seg.text}{" "}
                      {seg.evidenceIds.length > 0 && (
                        <button
                          onClick={() => setHighlight(seg.evidenceIds)}
                          className="align-baseline rounded bg-earth-100 px-1.5 py-0.5 text-[10px] font-medium text-earth-700 hover:bg-earth-200"
                          title="Show the evidence behind this statement"
                        >
                          {seg.evidenceIds.length} source
                          {seg.evidenceIds.length > 1 ? "s" : ""}
                        </button>
                      )}
                    </p>
                  ))}
                </div>
              </section>

              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-earth-500">
                  Key actors &amp; countries ({answer.countries.length})
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {answer.countries.map((c) => (
                    <span
                      key={c.id}
                      className="cursor-pointer rounded-md border border-earth-200 bg-earth-50 px-2 py-1 text-[11px] text-earth-800 hover:border-earth-400"
                      onClick={() => setHighlight(c.evidenceIds)}
                      title="Show evidence for this country"
                    >
                      {c.label}
                      {c.iso3 ? ` (${c.iso3})` : ""}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-earth-500">
                  Community actions source-backed:{" "}
                  {answer.communityActions.length === 0
                    ? "none yet — see data gaps."
                    : answer.communityActions.length}
                </p>
              </section>

              <section className="rounded-xl border border-earth-200 p-3">
                <button
                  onClick={() => setShowGraph((v) => !v)}
                  className="mb-1 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-earth-500"
                >
                  <span>Resource-flow network</span>
                  <span className="text-earth-400">
                    {showGraph ? "Hide ▲" : "Show ▼"}
                  </span>
                </button>
                {showGraph && (
                  <div className="h-[320px] overflow-hidden rounded-lg border border-earth-100">
                    <NetworkGraph
                      entities={answer.entities}
                      relations={answer.relations}
                      onSelectEvidence={setHighlight}
                    />
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-dashed border-amber-300 bg-amber-50/40 p-3">
                <DataGapPanel
                  gaps={answer.gaps}
                  conflicts={answer.conflicts}
                />
              </section>

              <section>
                <EvidencePanel
                  evidence={answer.evidence}
                  highlightIds={highlight}
                />
              </section>
            </>
          )}
        </div>

        <div className="border-t border-earth-100 p-3 text-[10px] leading-snug text-earth-500">
          Sources: USGS MCS 2024 &amp; PP1802 · World Bank Open Data (incl.
          trade flows) · World Bank WITS (bilateral trade) · Our World in Data /
          FAOSTAT · NASA EONET · USGS Earthquakes · Digitraffic AIS · Fields of
          The World (Sentinel-2, CC-BY-4.0) · Rhodium Group via ProPublica/NYT
          (US climate) · Project Drawdown · Planetary Boundaries (Richardson
          2023) · Natural Earth. No mocked data.
        </div>
      </aside>
    </main>
  );
}
