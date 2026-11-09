using Test
using TOML
include("../scripts/inspect.jl")
using .ReviewFacts

abstract type ReviewBase end
struct ReviewBox{T} <: ReviewBase
    value::T
end
review_leaf(x::Int) = x + 1
review_leaf(x::String) = length(x)
review_caller(x::Int) = review_leaf(x)

@testset "Julia facts" begin
    facts = ReviewFacts.inspect_methods(review_leaf)
    @test length(facts["methods"]) == 2
    selected = only(ReviewFacts.inspect_methods(review_leaf, Tuple{Int})["methods"])
    @test occursin("Int", selected["signature"])
    @test selected["file"] == @__FILE__
    @test readlines(selected["file"])[selected["line"]] == "review_leaf(x::Int) = x + 1"
    @test_throws ErrorException ReviewFacts.inspect_methods(review_leaf, Tuple{Symbol})
    type = ReviewFacts.inspect_type(ReviewBox{Int})
    @test type["fields"] == [Dict("name" => "value", "type" => "Int64")]
    @test type["supertype"] == "ReviewBase"
    @test "ReviewBox" in ReviewFacts.inspect_type(ReviewBase)["loaded_subtypes"]
    @test isempty(ReviewFacts.inspect_type(ReviewBase)["fields"])
    lowered = ReviewFacts.inspect_body(review_caller, Tuple{Int})
    typed = ReviewFacts.inspect_body(review_caller, Tuple{Int}; mode=:typed)
    @test occursin("review_leaf", only(lowered["bodies"]))
    @test occursin("review_leaf", only(typed["bodies"]))
    @test typed["input_types"] == "Tuple{Int64}"
    @test !typed["optimized"]
    @test TOML.parse(sprint(io -> TOML.print(io, type)))["fields"] == type["fields"]
    command = `$(Base.julia_cmd()) --startup-file=no $(joinpath(@__DIR__, "../scripts/inspect.jl")) methods sin --types $("Tuple{Float64}")`
    @test !isempty(TOML.parse(read(command, String))["methods"])
end
